import { GoogleGenAI } from '@google/genai';
import type { StigNode, Mutation } from '../types.js';
import { createMutation } from '../dispatch/mutations.js';

/**
 * Schema for Consolidator's semantic similarity response.
 */
const SIMILARITY_SCHEMA = {
  type: 'object',
  properties: {
    groups: {
      type: 'array',
      description: 'Groups of semantically equivalent siblings',
      items: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Paths of nodes that are semantic equivalents',
          },
          canonical: {
            type: 'string',
            description: 'Path of the node that should be kept (strongest/most complete)',
          },
          reason: {
            type: 'string',
            description: 'Brief explanation of why these are equivalent',
          },
        },
        required: ['paths', 'canonical', 'reason'],
      },
    },
  },
  required: ['groups'],
};

const SYSTEM_PROMPT = `You are a semantic analyzer for a specification tree. Your job is to identify semantically equivalent siblings - nodes that represent the same concept with different wording.

Examples of semantic equivalents:
- "Create Task" and "Task Creation" → same concept
- "Delete Task" and "Task Deletion" → same concept
- "Update Description" and "Modify Description" → same concept
- "Filter Tasks" and "Task Filtering" → same concept

NOT equivalents:
- "Create Task" and "Delete Task" → different operations
- "Task Priority" and "Task Due Date" → different attributes
- "Input Validation" and "Output Validation" → different stages

When you find equivalents, choose the "canonical" one based on:
1. More specific/descriptive content
2. More children (if applicable)
3. Higher confidence signal
4. Clearer naming

Return groups of equivalents. If no equivalents exist, return empty groups array.`;

interface SimilarityResponse {
  groups: Array<{
    paths: string[];
    canonical: string;
    reason: string;
  }>;
}

export interface ConsolidationResult {
  duplicateGroups: Array<{
    paths: string[];
    canonical: string;
    reason: string;
    action: 'merged' | 'flagged';
  }>;
  mutations: Mutation[];
  cost: { api_calls: number; input_tokens: number; output_tokens: number };
}

/**
 * Consolidator: An LLM-powered agent that identifies and merges semantic duplicates.
 *
 * In stigmergic terms: worker ants that clean up redundant pheromone trails,
 * consolidating effort into canonical paths.
 *
 * Safety: Only merges stable nodes (need ≤ 2, conf ≥ 8) to avoid race conditions.
 * Non-stable duplicates are flagged with conflict for the normal pulse loop.
 */
export class Consolidator {
  readonly name = 'Consolidator';
  readonly isRealAI = true;
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor(model = 'gemini-2.5-flash-lite', apiKey?: string) {
    const key = apiKey ?? process.env['GEMINI_API_KEY'];
    if (!key) {
      throw new Error('GEMINI_API_KEY is required for Consolidator');
    }
    this.ai = new GoogleGenAI({ apiKey: key });
    this.model = model;
  }

  /**
   * Analyze the tree and return consolidation mutations.
   * Only processes sibling groups with 2+ nodes.
   */
  async consolidate(
    nodes: StigNode[],
    options: { dryRun?: boolean; maxGroups?: number } = {},
  ): Promise<ConsolidationResult> {
    const result: ConsolidationResult = {
      duplicateGroups: [],
      mutations: [],
      cost: { api_calls: 0, input_tokens: 0, output_tokens: 0 },
    };

    // Group nodes by parent
    const siblingGroups = groupByParent(nodes);

    // Filter to groups with 2+ siblings worth analyzing
    const groupsToAnalyze: StigNode[][] = [];
    for (const siblings of siblingGroups.values()) {
      if (siblings.length >= 2) {
        groupsToAnalyze.push(siblings);
      }
    }

    if (groupsToAnalyze.length === 0) {
      return result;
    }

    // Limit groups to analyze
    const maxGroups = options.maxGroups ?? 10;
    const selectedGroups = groupsToAnalyze.slice(0, maxGroups);

    // Batch all sibling groups into one LLM call for efficiency
    const analysis = await this.analyzeSiblings(selectedGroups);
    result.cost = analysis.cost;

    // Process each identified duplicate group
    for (const group of analysis.groups) {
      if (group.paths.length < 2) continue;

      const nodesInGroup = group.paths
        .map(p => nodes.find(n => n.path === p))
        .filter((n): n is StigNode => n !== undefined);

      if (nodesInGroup.length < 2) continue;

      const canonical = nodesInGroup.find(n => n.path === group.canonical);
      const others = nodesInGroup.filter(n => n.path !== group.canonical);

      if (!canonical || others.length === 0) continue;

      // Check if all nodes in group are stable
      const allStable = nodesInGroup.every(n => isStable(n));

      if (allStable && !options.dryRun) {
        // Safe to merge: absorb content from others into canonical, then delete others
        result.duplicateGroups.push({ ...group, action: 'merged' });

        // Absorb content from duplicates
        const absorbedContent = others
          .filter(n => n.content.trim().length > 0)
          .map(n => `[Merged from ${n.name}]: ${n.content.trim()}`)
          .join('\n\n');

        if (absorbedContent) {
          const newContent = canonical.content.trim()
            ? `${canonical.content.trim()}\n\n${absorbedContent}`
            : absorbedContent;

          result.mutations.push(
            createMutation('UPDATE_CONTENT', canonical.path, { content: newContent }),
          );
        }

        // Delete the duplicate nodes
        for (const other of others) {
          result.mutations.push(createMutation('DELETE_NODE', other.path, {}));
        }
      } else {
        // Not safe to merge yet - flag with conflict
        result.duplicateGroups.push({ ...group, action: 'flagged' });

        const reason = `Consolidator: Semantic duplicate of "${canonical.name}" - ${group.reason}`;
        for (const other of others) {
          result.mutations.push(
            createMutation('UPDATE_SIGNALS', other.path, {
              signals: { conflict: Math.min(10, other.signals.conflict + 2) },
              conflict_reason: reason,
            }),
          );
        }
      }
    }

    return result;
  }

  /**
   * Use LLM to identify semantic equivalents in sibling groups.
   */
  private async analyzeSiblings(
    groups: StigNode[][],
  ): Promise<{ groups: SimilarityResponse['groups']; cost: ConsolidationResult['cost'] }> {
    const zeroCost = { api_calls: 1, input_tokens: 0, output_tokens: 0 };

    try {
      const prompt = buildAnalysisPrompt(groups);

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseJsonSchema: SIMILARITY_SCHEMA,
          temperature: 0.1, // Low temperature for consistent analysis
        },
      });

      const cost = {
        api_calls: 1,
        input_tokens: response.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      };

      const text = response.text;
      if (!text) {
        return { groups: [], cost };
      }

      const parsed: SimilarityResponse = JSON.parse(text);
      return { groups: parsed.groups ?? [], cost };
    } catch (err) {
      console.error('Consolidator LLM error:', err instanceof Error ? err.message : err);
      return { groups: [], cost: zeroCost };
    }
  }
}

/**
 * Build prompt for semantic similarity analysis.
 */
function buildAnalysisPrompt(groups: StigNode[][]): string {
  const parts: string[] = [
    'Analyze these sibling groups for semantic equivalents.\n',
  ];

  for (let i = 0; i < groups.length; i++) {
    const siblings = groups[i];
    const parent = getParentPath(siblings[0].path);

    parts.push(`## Group ${i + 1}: Children of "${parent}"\n`);

    for (const node of siblings) {
      const stability = isStable(node) ? '[STABLE]' : '';
      parts.push(
        `- **${node.name}** (${node.path}) ${stability}`,
      );
      parts.push(`  need:${node.signals.need} conf:${node.signals.confidence}`);
      if (node.content.trim()) {
        const preview = node.content.trim().slice(0, 100);
        parts.push(`  Content: ${preview}${node.content.length > 100 ? '...' : ''}`);
      }
      parts.push('');
    }
  }

  parts.push('\nIdentify any semantic equivalents within each group. Return empty groups array if none found.');

  return parts.join('\n');
}

/**
 * Check if a node is stable (safe to merge).
 */
function isStable(node: StigNode): boolean {
  return node.signals.need <= 2 && node.signals.confidence >= 8 && node.signals.conflict <= 1;
}

/**
 * Get parent path from a node path.
 */
function getParentPath(path: string): string {
  if (path === '.') return '.';
  const parts = path.split('/');
  return parts.length === 1 ? '.' : parts.slice(0, -1).join('/');
}

/**
 * Group nodes by parent path.
 */
function groupByParent(nodes: StigNode[]): Map<string, StigNode[]> {
  const groups = new Map<string, StigNode[]>();

  for (const node of nodes) {
    if (node.path === '.') continue;

    const parent = getParentPath(node.path);

    if (!groups.has(parent)) {
      groups.set(parent, []);
    }
    groups.get(parent)!.push(node);
  }

  return groups;
}
