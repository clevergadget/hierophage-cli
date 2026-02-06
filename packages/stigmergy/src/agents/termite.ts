import { GoogleGenAI } from '@google/genai';
import type { AgentCost } from './agent.js';
import type { StigNode } from '../types.js';

/**
 * Result from a cross-branch mound inspection.
 */
export interface InspectionResult {
  node_a: string;      // path
  node_b: string;      // path
  are_equivalent: boolean;
  reasoning: string;
  cost: AgentCost;
  error?: string;
}

const INSPECTION_SCHEMA = {
  type: 'object',
  properties: {
    are_equivalent: {
      type: 'boolean',
      description: 'Whether these two nodes describe the same concept or solve the same problem',
    },
    reasoning: {
      type: 'string',
      description: 'Brief explanation of the assessment',
    },
  },
  required: ['are_equivalent', 'reasoning'],
};

const INSPECTION_PROMPT = `You are a mound inspector — a termite checking the colony's tunnel network for
structural redundancy. You receive two nodes from DIFFERENT branches of a
specification tree.

Your job: Do these nodes describe the SAME concept, feature, or responsibility?

EQUIVALENT means:
- They solve the same problem ("Local Storage Handler" and "Browser Persistence Layer")
- One is a subset of the other with no meaningful distinction
- A developer would implement them as the same component

NOT equivalent:
- They share a keyword but serve different purposes ("User Authentication" vs "User Profile")
- They are related but address different concerns ("Input Validation" vs "Error Handling")
- They operate at different levels of abstraction unless one fully subsumes the other

Be conservative. Only flag TRUE equivalents. False positives waste colony resources.`;

/**
 * Termite: Cross-branch mound inspector.
 *
 * Termites constantly patrol their mound's tunnel network, inspecting galleries
 * for structural redundancy. When a termite finds two tunnels serving the same
 * purpose, it deposits alarm pheromone so the colony can reorganize.
 *
 * This agent randomly patrols cross-branch node pairs, asks a binary LLM question
 * ("same concept?"), and raises conflict signals when it finds redundancy.
 * Detection only — the existing ecology (Resolver, evaporation, FlashSpore seeing
 * conflict) handles resolution.
 */
export class Termite {
  readonly name = 'Termite';
  readonly isRealAI = true;
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor(model = 'gemini-2.5-flash-lite', apiKey?: string) {
    const key = apiKey ?? process.env['GEMINI_API_KEY'];
    if (!key) {
      throw new Error('GEMINI_API_KEY is required for Termite.');
    }
    this.ai = new GoogleGenAI({ apiKey: key });
    this.model = model;
  }

  /**
   * Inspect two nodes from different branches for semantic equivalence.
   */
  async inspect(nodeA: StigNode, nodeB: StigNode): Promise<InspectionResult> {
    const zeroCost: AgentCost = { api_calls: 1, input_tokens: 0, output_tokens: 0 };

    try {
      const prompt = buildInspectionPrompt(nodeA, nodeB);

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction: INSPECTION_PROMPT,
          responseMimeType: 'application/json',
          responseJsonSchema: INSPECTION_SCHEMA,
          temperature: 0.1,
        },
      });

      const cost: AgentCost = {
        api_calls: 1,
        input_tokens: response.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      };

      const text = response.text;
      if (!text) {
        return { node_a: nodeA.path, node_b: nodeB.path, are_equivalent: false, reasoning: 'No response', cost };
      }

      const parsed = JSON.parse(text) as {
        are_equivalent: boolean;
        reasoning: string;
      };

      return {
        node_a: nodeA.path,
        node_b: nodeB.path,
        are_equivalent: parsed.are_equivalent,
        reasoning: parsed.reasoning,
        cost,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { node_a: nodeA.path, node_b: nodeB.path, are_equivalent: false, reasoning: '', cost: zeroCost, error: msg };
    }
  }
}

/**
 * Build the user prompt for a cross-branch inspection.
 * Uses names + content only (no full paths) to avoid position bias.
 */
function buildInspectionPrompt(nodeA: StigNode, nodeB: StigNode): string {
  const parts: string[] = [];

  parts.push('## Node A\n');
  parts.push(`Name: ${nodeA.name}`);
  parts.push(`Signals: need=${nodeA.signals.need} confidence=${nodeA.signals.confidence} conflict=${nodeA.signals.conflict}`);
  parts.push(`\nContent:\n${nodeA.content || '(empty)'}`);

  parts.push('\n## Node B\n');
  parts.push(`Name: ${nodeB.name}`);
  parts.push(`Signals: need=${nodeB.signals.need} confidence=${nodeB.signals.confidence} conflict=${nodeB.signals.conflict}`);
  parts.push(`\nContent:\n${nodeB.content || '(empty)'}`);

  parts.push('\nDo these two nodes describe the same concept, feature, or responsibility?');

  return parts.join('\n');
}

/**
 * Sample cross-branch node pairs for inspection.
 *
 * Algorithm:
 * 1. Filter to non-root nodes at minimum depth
 * 2. Group by top-level branch (first path segment)
 * 3. Need at least 2 branches — return empty if not
 * 4. Weight each node by (10 - confidence) — low-confidence = recently created = higher priority
 * 5. Pick weighted-random pairs from different branches
 * 6. Deduplicate pairs
 */
export function sampleCrossBranchPairs(
  nodes: StigNode[],
  count: number,
  minDepth: number,
): [StigNode, StigNode][] {
  // Filter to non-root nodes at sufficient depth
  const eligible = nodes.filter(n => {
    if (n.path === '.') return false;
    const depth = n.path.split('/').length;
    return depth >= minDepth;
  });

  // Group by top-level branch
  const branches = new Map<string, StigNode[]>();
  for (const node of eligible) {
    const topBranch = node.path.split('/')[0];
    if (!branches.has(topBranch)) branches.set(topBranch, []);
    branches.get(topBranch)!.push(node);
  }

  // Need at least 2 branches
  if (branches.size < 2) return [];

  const branchKeys = [...branches.keys()];
  const pairs: [StigNode, StigNode][] = [];
  const seen = new Set<string>();

  for (let i = 0; i < count * 3 && pairs.length < count; i++) {
    // Pick first node (weighted random from any branch)
    const nodeA = weightedRandomPick(eligible);
    if (!nodeA) break;

    const branchA = nodeA.path.split('/')[0];

    // Pick second node from a different branch
    const otherBranchKeys = branchKeys.filter(k => k !== branchA);
    if (otherBranchKeys.length === 0) break;

    const branchB = otherBranchKeys[Math.floor(Math.random() * otherBranchKeys.length)];
    const branchBNodes = branches.get(branchB)!;
    const nodeB = weightedRandomPick(branchBNodes);
    if (!nodeB) continue;

    // Deduplicate (order-independent)
    const key = [nodeA.path, nodeB.path].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);

    pairs.push([nodeA, nodeB]);
  }

  return pairs;
}

/**
 * Weighted random pick: nodes with lower confidence are more likely to be selected.
 * Weight = (10 - confidence), so confidence 0 → weight 10, confidence 10 → weight 0 (clamped to 1).
 */
function weightedRandomPick(nodes: StigNode[]): StigNode | null {
  if (nodes.length === 0) return null;

  const weights = nodes.map(n => Math.max(1, 10 - n.signals.confidence));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  let r = Math.random() * totalWeight;
  for (let i = 0; i < nodes.length; i++) {
    r -= weights[i];
    if (r <= 0) return nodes[i];
  }

  return nodes[nodes.length - 1];
}
