import { GoogleGenAI } from '@google/genai';
import type { StigNode, Mutation } from '../types.js';
import { createMutation } from '../dispatch/mutations.js';

/**
 * Schema for Weaver's cross-branch overlap detection.
 */
const OVERLAP_SCHEMA = {
  type: 'object',
  properties: {
    overlaps: {
      type: 'array',
      description: 'Pairs of nodes from different branches that represent the same concept',
      items: {
        type: 'object',
        properties: {
          node_a: { type: 'string', description: 'Path of first node' },
          node_b: { type: 'string', description: 'Path of second node' },
          reason: { type: 'string', description: 'Why these are the same concept' },
          recommendation: {
            type: 'string',
            enum: ['merge', 'link', 'keep_separate'],
            description: 'What to do about this overlap',
          },
        },
        required: ['node_a', 'node_b', 'reason', 'recommendation'],
      },
    },
  },
  required: ['overlaps'],
};

const SYSTEM_PROMPT = `You are analyzing a specification tree for semantic overlaps ACROSS DIFFERENT BRANCHES.

Your job: Find nodes in DIFFERENT parts of the tree that represent the SAME concept.

Examples of cross-branch overlaps:
- "API Design" at root AND "backend-api" under persistence → same concern, different locations
- "User Authentication" at root AND "authentication-authorization" under API → same concern
- "state-synchronization" under state-management AND "cloud-sync-service" under persistence → same concern

NOT overlaps (keep separate):
- "Task Creation" and "Task Deletion" → different operations
- "Frontend" and "Backend" → different layers (but might reference each other)
- Parent and child nodes → hierarchical, not overlap

For each overlap found, recommend:
- "merge": These should be consolidated into one node
- "link": These should remain separate but reference each other
- "keep_separate": On reflection, these are actually distinct concepts

Only report TRUE cross-branch overlaps. If none exist, return empty overlaps array.`;

interface OverlapResponse {
  overlaps: Array<{
    node_a: string;
    node_b: string;
    reason: string;
    recommendation: 'merge' | 'link' | 'keep_separate';
  }>;
}

export interface WeaveResult {
  overlaps: OverlapResponse['overlaps'];
  mutations: Mutation[];
  cost: { api_calls: number; input_tokens: number; output_tokens: number };
}

/**
 * Weaver: Finds semantic overlaps ACROSS branches (not just siblings).
 *
 * In stigmergic terms: Mycelial network that creates lateral connections
 * between vertical silos, enabling cross-branch awareness.
 */
export class Weaver {
  readonly name = 'Weaver';
  readonly isRealAI = true;
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor(model = 'gemini-2.5-flash-lite', apiKey?: string) {
    const key = apiKey ?? process.env['GEMINI_API_KEY'];
    if (!key) {
      throw new Error('GEMINI_API_KEY is required for Weaver');
    }
    this.ai = new GoogleGenAI({ apiKey: key });
    this.model = model;
  }

  /**
   * Scan tree for cross-branch semantic overlaps.
   */
  async weave(nodes: StigNode[]): Promise<WeaveResult> {
    const result: WeaveResult = {
      overlaps: [],
      mutations: [],
      cost: { api_calls: 0, input_tokens: 0, output_tokens: 0 },
    };

    if (nodes.length < 2) return result;

    try {
      const prompt = buildTreePrompt(nodes);

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseJsonSchema: OVERLAP_SCHEMA,
          temperature: 0.1,
        },
      });

      result.cost = {
        api_calls: 1,
        input_tokens: response.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      };

      const text = response.text;
      if (!text) return result;

      const parsed: OverlapResponse = JSON.parse(text);
      result.overlaps = parsed.overlaps ?? [];

      // Generate mutations for overlaps
      for (const overlap of result.overlaps) {
        if (overlap.recommendation === 'keep_separate') continue;

        // Find the nodes
        const nodeA = nodes.find(n => n.path === overlap.node_a);
        const nodeB = nodes.find(n => n.path === overlap.node_b);
        if (!nodeA || !nodeB) continue;

        if (overlap.recommendation === 'merge') {
          // MERGE: Flag both with conflict so Synthesizer or human can address
          const reason = `Weaver: Should merge with "${overlap.node_b}" - ${overlap.reason}`;
          result.mutations.push(
            createMutation('UPDATE_SIGNALS', overlap.node_a, {
              signals: { conflict: Math.min(10, nodeA.signals.conflict + 2) },
              conflict_reason: reason,
            }),
          );

          const reasonB = `Weaver: Should merge with "${overlap.node_a}" - ${overlap.reason}`;
          result.mutations.push(
            createMutation('UPDATE_SIGNALS', overlap.node_b, {
              signals: { conflict: Math.min(10, nodeB.signals.conflict + 2) },
              conflict_reason: reasonB,
            }),
          );
        }
        // LINK: No mutations - just informational. The overlap is reported but
        // doesn't raise conflict since related-but-distinct nodes are fine.
      }

      return result;
    } catch (err) {
      console.error('Weaver error:', err instanceof Error ? err.message : err);
      return result;
    }
  }
}

/**
 * Build prompt showing tree structure for overlap detection.
 */
function buildTreePrompt(nodes: StigNode[]): string {
  // Group nodes by top-level branch
  const branches = new Map<string, StigNode[]>();

  for (const node of nodes) {
    if (node.path === '.') continue;

    const topLevel = node.path.split('/')[0];
    if (!branches.has(topLevel)) {
      branches.set(topLevel, []);
    }
    branches.get(topLevel)!.push(node);
  }

  const parts: string[] = [
    '## Tree Structure (grouped by top-level branch)\n',
    'Look for concepts that appear in MULTIPLE branches.',
    'Use both the node NAME and CONTENT to determine semantic overlap.\n',
  ];

  for (const [branch, branchNodes] of branches) {
    parts.push(`\n### Branch: ${branch}`);
    for (const node of branchNodes) {
      const depth = node.path.split('/').length;
      const indent = '  '.repeat(depth - 1);
      const summary = summarizeContent(node.content);
      parts.push(`${indent}- **${node.name}** (${node.path})`);
      if (summary) {
        parts.push(`${indent}  ${summary}`);
      }
    }
  }

  parts.push('\n\nIdentify any cross-branch semantic overlaps based on actual content, not just names.');

  return parts.join('\n');
}

/**
 * Extract content for overlap detection.
 * Strips headers, keeps full substance.
 */
function summarizeContent(content: string): string {
  if (!content) return '';

  const trimmed = content.trim();
  if (!trimmed || trimmed.length < 10) return '';

  // Remove markdown headers, keep substance
  const lines = trimmed.split('\n')
    .filter(line => !line.trim().startsWith('#'))
    .map(line => line.trim())
    .filter(line => line.length > 0);

  return lines.join(' ');
}
