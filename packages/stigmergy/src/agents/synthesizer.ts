import { GoogleGenAI } from '@google/genai';
import type { StigNode, Mutation } from '../types.js';
import { createMutation } from '../dispatch/mutations.js';

/**
 * Schema for Synthesizer's semantic similarity response.
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

/**
 * Schema for synthesis response.
 */
const SYNTHESIS_SCHEMA = {
  type: 'object',
  properties: {
    synthesized_content: {
      type: 'string',
      description: 'The unified, synthesized content that combines all inputs',
    },
    synthesized_name: {
      type: 'string',
      description: 'Optional: A better name for the merged node if the current canonical name is suboptimal',
    },
  },
  required: ['synthesized_content'],
};

const SIMILARITY_PROMPT = `You are a semantic analyzer for a specification tree. Your job is to identify semantically equivalent siblings - nodes that represent THE SAME concept with different wording.

## What ARE semantic equivalents (MERGE THESE):
- "Create Task" and "Task Creation" → SAME concept, different wording
- "Delete Task" and "Task Deletion" → SAME concept, different wording
- "edit-task-modal" and "edit-task-modal-ui" → redundant "-ui" suffix
- "confirmation-dialog" and "confirmation-dialog-ui" → redundant "-ui" suffix
- "Update Description", "Update Due Date", "Update Priority" → SAME operation (update) on different fields, can merge into parent "Update Task"

## What are NOT equivalents (NEVER MERGE):
- "Create Task" and "Delete Task" and "Update Task" → DIFFERENT operations, keep separate
- "Task Priority" and "Task Due Date" → DIFFERENT attributes
- "Input Validation" and "Output Validation" → DIFFERENT stages
- "Frontend" and "Backend" → DIFFERENT layers
- Parent and its children → hierarchical relationship, not equivalence

CRITICAL: Operations like Create/Delete/Update are fundamentally DIFFERENT even if they share a parent. Do NOT merge them.

When you find TRUE equivalents, choose the "canonical" one based on:
1. More specific/descriptive content
2. More children (structural importance)
3. Higher confidence signal
4. Clearer, more concise naming

If in doubt, do NOT group nodes. Only group clear semantic equivalents.
Return empty groups array if no TRUE equivalents exist.`;

const SYNTHESIS_PROMPT = `You are a specification synthesizer. You receive multiple nodes that describe the same concept in different ways or at different abstraction levels.

Your job is to SYNTHESIZE them into ONE comprehensive node that:
1. Captures ALL valuable information from all inputs
2. Eliminates redundancy and fluff
3. Is well-structured and readable
4. Could serve as the single canonical description a developer would implement from

Do NOT just concatenate the inputs. SYNTHESIZE them into unified prose.
Do NOT add information not present in the sources.
Do NOT include meta-commentary like "This section combines...".

Output clean, direct specification content.`;

interface SimilarityResponse {
  groups: Array<{
    paths: string[];
    canonical: string;
    reason: string;
  }>;
}

interface SynthesisResponse {
  synthesized_content: string;
  synthesized_name?: string;
}

export interface SynthesisResult {
  duplicateGroups: Array<{
    paths: string[];
    canonical: string;
    reason: string;
    action: 'synthesized' | 'flagged';
  }>;
  mutations: Mutation[];
  cost: { api_calls: number; input_tokens: number; output_tokens: number };
}

/**
 * Synthesizer: An LLM-powered agent that identifies semantic duplicates and
 * synthesizes them into unified, higher-quality nodes.
 *
 * In stigmergic terms: The digestive system that turns redundancy into density.
 * Unlike simple deletion, it SYNTHESIZES the best of all inputs into a super-node.
 *
 * Safety: Only synthesizes stable nodes (need ≤ 2, conf ≥ 8) to avoid race conditions.
 * Non-stable duplicates are flagged with conflict for the normal pulse loop.
 */
export class Synthesizer {
  readonly name = 'Synthesizer';
  readonly isRealAI = true;
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor(model = 'gemini-2.5-flash-lite', apiKey?: string) {
    const key = apiKey ?? process.env['GEMINI_API_KEY'];
    if (!key) {
      throw new Error('GEMINI_API_KEY is required for Synthesizer');
    }
    this.ai = new GoogleGenAI({ apiKey: key });
    this.model = model;
  }

  /**
   * Analyze the tree and return synthesis mutations.
   * Only processes sibling groups with 2+ nodes.
   */
  async synthesize(
    nodes: StigNode[],
    options: { dryRun?: boolean; maxGroups?: number } = {},
  ): Promise<SynthesisResult> {
    const result: SynthesisResult = {
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

    // Step 1: Identify semantic duplicates
    const analysis = await this.analyzeSiblings(selectedGroups);
    result.cost.api_calls += analysis.cost.api_calls;
    result.cost.input_tokens += analysis.cost.input_tokens;
    result.cost.output_tokens += analysis.cost.output_tokens;

    // Step 2: Process each identified duplicate group
    for (const group of analysis.groups) {
      if (group.paths.length < 2) continue;

      const nodesInGroup = group.paths
        .map(p => nodes.find(n => n.path === p))
        .filter((n): n is StigNode => n !== undefined);

      if (nodesInGroup.length < 2) continue;

      const canonical = nodesInGroup.find(n => n.path === group.canonical);
      const others = nodesInGroup.filter(n => n.path !== group.canonical);

      if (!canonical || others.length === 0) continue;

      // Check if all nodes in group are stable (safe to merge)
      const allStable = nodesInGroup.every(n => isStable(n));

      if (allStable) {
        if (options.dryRun) {
          // Dry run: report what WOULD happen, but don't call synthesis LLM
          result.duplicateGroups.push({ ...group, action: 'synthesized' });

          // Show what the merge mutation would look like
          result.mutations.push(
            createMutation('MERGE_NODES', canonical.path, {
              content: '(would synthesize)',
              name: canonical.name,
              signals: { confidence: 10, need: 1, conflict: 0 },
              merge_sources: others.map(n => n.path),
            }),
          );
        } else {
          // Real run: call LLM to synthesize unified content
          const synthesis = await this.synthesizeNodes(canonical, others, group.reason);
          result.cost.api_calls += synthesis.cost.api_calls;
          result.cost.input_tokens += synthesis.cost.input_tokens;
          result.cost.output_tokens += synthesis.cost.output_tokens;

          if (synthesis.content) {
            result.duplicateGroups.push({ ...group, action: 'synthesized' });

            // Calculate boosted confidence: max of all + 1
            const maxConf = Math.max(...nodesInGroup.map(n => n.signals.confidence));
            const boostedConf = Math.min(10, maxConf + 1);

            // Single atomic MERGE_NODES mutation
            result.mutations.push(
              createMutation('MERGE_NODES', canonical.path, {
                content: synthesis.content,
                name: synthesis.name ?? canonical.name,
                signals: { confidence: boostedConf, need: 1, conflict: 0 },
                merge_sources: others.map(n => n.path),
              }),
            );
          } else {
            // Synthesis failed, flag instead
            result.duplicateGroups.push({ ...group, action: 'flagged' });
            const reason = `Synthesizer: Failed to synthesize with "${canonical.name}" - ${group.reason}`;
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
      } else {
        // Not safe to merge yet - flag with conflict
        result.duplicateGroups.push({ ...group, action: 'flagged' });

        const reason = `Synthesizer: Semantic duplicate of "${canonical.name}" - ${group.reason}`;
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
  ): Promise<{ groups: SimilarityResponse['groups']; cost: SynthesisResult['cost'] }> {
    const zeroCost = { api_calls: 1, input_tokens: 0, output_tokens: 0 };

    try {
      const prompt = buildAnalysisPrompt(groups);

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction: SIMILARITY_PROMPT,
          responseMimeType: 'application/json',
          responseJsonSchema: SIMILARITY_SCHEMA,
          temperature: 0.1,
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
      console.error('Synthesizer analysis error:', err instanceof Error ? err.message : err);
      return { groups: [], cost: zeroCost };
    }
  }

  /**
   * Use LLM to synthesize multiple nodes into unified content.
   */
  private async synthesizeNodes(
    canonical: StigNode,
    others: StigNode[],
    reason: string,
  ): Promise<{ content: string | null; name?: string; cost: SynthesisResult['cost'] }> {
    const zeroCost = { api_calls: 1, input_tokens: 0, output_tokens: 0 };

    try {
      const prompt = buildSynthesisPrompt(canonical, others, reason);

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction: SYNTHESIS_PROMPT,
          responseMimeType: 'application/json',
          responseJsonSchema: SYNTHESIS_SCHEMA,
          temperature: 0.2,
        },
      });

      const cost = {
        api_calls: 1,
        input_tokens: response.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      };

      const text = response.text;
      if (!text) {
        return { content: null, cost };
      }

      const parsed: SynthesisResponse = JSON.parse(text);
      return {
        content: parsed.synthesized_content ?? null,
        name: parsed.synthesized_name,
        cost,
      };
    } catch (err) {
      console.error('Synthesizer synthesis error:', err instanceof Error ? err.message : err);
      return { content: null, cost: zeroCost };
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
 * Build prompt for synthesis.
 */
function buildSynthesisPrompt(canonical: StigNode, others: StigNode[], reason: string): string {
  const allNodes = [canonical, ...others];

  const parts: string[] = [
    `## Synthesis Task\n`,
    `These ${allNodes.length} nodes describe the same concept: "${reason}"\n`,
    `Synthesize them into ONE unified specification.\n`,
    `\n## Input Nodes\n`,
  ];

  for (const node of allNodes) {
    parts.push(`### ${node.name} (${node.path})`);
    parts.push(`Confidence: ${node.signals.confidence}`);
    parts.push('');
    parts.push(node.content || '(no content)');
    parts.push('\n---\n');
  }

  parts.push('\nSynthesize these into one comprehensive node. Preserve all valuable details, eliminate redundancy.');

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

// Re-export Consolidator as alias for backwards compatibility
export { Synthesizer as Consolidator };
