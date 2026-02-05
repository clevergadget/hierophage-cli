import { GoogleGenAI } from '@google/genai';
import type { AgentCost } from './agent.js';
import type { Mutation, StigNode } from '../types.js';
import { createMutation } from '../dispatch/mutations.js';

/**
 * Result from a conflict resolution attempt.
 */
export interface ResolverResult {
  node_path: string;
  resolved: boolean;
  mutations: Mutation[];
  cost: AgentCost;
  error?: string;
}

/**
 * Schema for Resolver's structured JSON response.
 */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    analysis: {
      type: 'string',
      description: 'Brief analysis of the conflict and how to resolve it',
    },
    resolved: {
      type: 'boolean',
      description: 'Whether the conflict can be resolved',
    },
    new_content: {
      type: 'string',
      description: 'Rewritten content that resolves the conflict (if resolved)',
    },
    new_conflict_level: {
      type: 'number',
      description: 'New conflict signal value (0-10, should be lower than before)',
    },
  },
  required: ['analysis', 'resolved'],
};

const SYSTEM_PROMPT = `You are a conflict resolution agent for a specification tree. You receive a node that has been flagged as having conflicts (contradictions, tensions, or incompatibilities).

Your job is to:
1. Analyze what the conflict actually is
2. Rewrite the content to resolve or acknowledge the conflict
3. Suggest a new (lower) conflict level

Types of conflicts you might see:
- Contradictory requirements (e.g., "must be real-time" vs "batch processing only")
- Incompatible approaches in siblings (e.g., two children propose mutually exclusive solutions)
- Ambiguous scope that creates tension with parent/sibling nodes
- Over-specified details that conflict with higher-level decisions

Resolution strategies:
- Clarify scope to eliminate ambiguity
- Choose one approach and note the decision
- Acknowledge trade-offs explicitly
- Split into separate concerns if truly incompatible
- Remove redundant or contradictory details

Output JSON with:
- analysis: What's the conflict?
- resolved: Can you resolve it?
- new_content: Rewritten content (if resolved)
- new_conflict_level: Suggested conflict value (0-3 if resolved, higher if not)`;

/**
 * Resolver: An LLM-powered agent for resolving conflicts in the specification tree.
 *
 * Unlike FlashSpore which operates on priority, Resolver specifically targets
 * nodes with conflict > 0 and attempts to resolve contradictions.
 */
export class Resolver {
  readonly name = 'Resolver';
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor(model = 'gemini-2.5-flash-lite', apiKey?: string) {
    const key = apiKey ?? process.env['GEMINI_API_KEY'];
    if (!key) {
      throw new Error('GEMINI_API_KEY is required for Resolver.');
    }
    this.ai = new GoogleGenAI({ apiKey: key });
    this.model = model;
  }

  /**
   * Attempt to resolve conflict in a single node.
   */
  async resolve(
    node: StigNode,
    siblings: StigNode[],
    parentContent?: string,
  ): Promise<ResolverResult> {
    const zeroCost: AgentCost = { api_calls: 1, input_tokens: 0, output_tokens: 0 };

    try {
      const prompt = buildPrompt(node, siblings, parentContent);

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseJsonSchema: RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      });

      const cost: AgentCost = {
        api_calls: 1,
        input_tokens: response.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      };

      const text = response.text;
      if (!text) {
        return { node_path: node.path, resolved: false, mutations: [], cost };
      }

      const parsed = JSON.parse(text) as {
        analysis: string;
        resolved: boolean;
        new_content?: string;
        new_conflict_level?: number;
      };

      const mutations: Mutation[] = [];

      if (parsed.resolved && parsed.new_content) {
        mutations.push(
          createMutation('UPDATE_CONTENT', node.path, {
            content: parsed.new_content,
          }),
        );
      }

      if (parsed.new_conflict_level !== undefined) {
        const newConflict = Math.max(0, Math.min(10, Math.round(parsed.new_conflict_level)));
        if (newConflict < node.signals.conflict) {
          mutations.push(
            createMutation('UPDATE_SIGNALS', node.path, {
              signals: { conflict: newConflict },
            }),
          );
        }
      }

      return {
        node_path: node.path,
        resolved: parsed.resolved,
        mutations,
        cost,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { node_path: node.path, resolved: false, mutations: [], cost: zeroCost, error: msg };
    }
  }

  /**
   * Resolve conflicts across multiple nodes.
   */
  async resolveMany(
    nodes: StigNode[],
    getSiblings: (node: StigNode) => StigNode[],
    getParentContent: (node: StigNode) => string | undefined,
    maxNodes = 10,
  ): Promise<ResolverResult[]> {
    // Sort by conflict level (highest first) and take top N
    const conflictNodes = nodes
      .filter((n) => n.signals.conflict > 0)
      .sort((a, b) => b.signals.conflict - a.signals.conflict)
      .slice(0, maxNodes);

    const results: ResolverResult[] = [];

    for (const node of conflictNodes) {
      const result = await this.resolve(node, getSiblings(node), getParentContent(node));
      results.push(result);
    }

    return results;
  }
}

function buildPrompt(node: StigNode, siblings: StigNode[], parentContent?: string): string {
  const parts: string[] = [];

  parts.push('## Node with Conflict\n');
  parts.push(`Path: ${node.path}`);
  parts.push(`Name: ${node.name}`);
  parts.push(`Signals: need=${node.signals.need} confidence=${node.signals.confidence} conflict=${node.signals.conflict}`);

  // Include conflict reasons if available
  const reasons = node.evidence.conflict_reasons;
  if (reasons && reasons.length > 0) {
    parts.push('\n### Conflict Reasons (why this was flagged):');
    for (const reason of reasons) {
      parts.push(`- ${reason}`);
    }
  }

  parts.push(`\nContent:\n${node.content || '(empty)'}`);

  if (parentContent) {
    parts.push('\n## Parent Context\n');
    parts.push(parentContent);
  }

  if (siblings.length > 0) {
    parts.push('\n## Sibling Nodes\n');
    for (const sib of siblings) {
      parts.push(`### ${sib.name} [conflict:${sib.signals.conflict}]`);
      parts.push(sib.content || '(empty)');
      parts.push('');
    }
  }

  parts.push('\nAnalyze the conflict and provide a resolution. If conflict reasons are listed above, address them directly.');

  return parts.join('\n');
}
