import { GoogleGenAI } from '@google/genai';
import type { Agent, AgentCost, AgentResult, ColonyContext } from './agent.js';
import type { Mutation, StigNode } from '../types.js';
import { createMutation } from '../dispatch/mutations.js';

/**
 * Schema for FlashSpore's structured JSON response.
 */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reasoning: {
      type: 'string',
      description: 'Brief explanation of why this action was chosen',
    },
    action: {
      type: 'string',
      enum: ['DECOMPOSE', 'REVIEW', 'UPDATE_CONTENT', 'SETTLE'],
      description: 'The high-level action to take on the target node',
    },
    mutations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['CREATE_NODE', 'UPDATE_CONTENT', 'UPDATE_SIGNALS'],
          },
          path: { type: 'string' },
          name: { type: 'string' },
          content: { type: 'string' },
          signals: {
            type: 'object',
            properties: {
              need: { type: 'number' },
              confidence: { type: 'number' },
              conflict: { type: 'number' },
            },
          },
        },
        required: ['type', 'path'],
      },
    },
  },
  required: ['reasoning', 'action', 'mutations'],
};

/**
 * Base system prompt: core rules that apply regardless of phase.
 */
const BASE_SYSTEM_PROMPT = `You are a stigmergic agent operating on a specification tree. Each node represents a concern (problem, requirement, or design decision) with pheromone signals:

- **need** (0-10): How much work this concern requires. Higher = more urgent.
- **confidence** (0-10): How well-understood this concern is. Higher = more settled.
- **conflict** (0-10): Contradictions or tensions present. Higher = more conflicted.

You receive a target node, its context chain (root → target), and its existing children.

## Actions

1. **DECOMPOSE**: Break a node into 2-4 child sub-concerns. Each child must be distinct.
2. **REVIEW**: Assess a node with children. Update signals based on assessment.
3. **UPDATE_CONTENT**: Improve the description with concrete details.
4. **SETTLE**: Mark a node as resolved (confidence 8-9, need 1-2).

## Path Rules

For CREATE_NODE, child paths must be simple slugs under the target.

**When target is "." (root):** Use just the slug name.
- CORRECT: "user-interface", "backend-api", "data-storage"
- WRONG: "./user-interface", ".root/user-interface", "/user-interface"

**When target is a non-root path:** Use format \`{target_path}/{child-slug}\`
- CORRECT: "deployment/ci-cd", "deployment/hosting"
- WRONG: "./deployment/ci-cd", "deployment/deployment-ci"

Slugs must NOT repeat the parent name. Each path must be unique.

## Signal Rules

- Values are integers 0-10.
- No DELETE_NODE mutations.
- Each mutation path must be unique.

## Semantic Deduplication (CRITICAL)

Before creating a child, check if a sibling with the same MEANING already exists.
Semantic equivalents must NOT coexist:
- "Create Task" and "Task Creation" → same concept, keep one
- "Delete Task" and "Task Deletion" → same concept, keep one
- "Filter Tasks" under different parents → redundant, consolidate

When you see an existing child that covers the same concept:
1. Do NOT create a duplicate child with slightly different wording
2. Instead, UPDATE_CONTENT on the existing child to add your insights
3. Or UPDATE_SIGNALS to adjust its priority

The tree should have one canonical location for each concept. Redundant nodes waste effort and create confusion.

## Pragmatism Rules (CRITICAL)

You are specifying the **most likely app**, not the theoretically complete solution.

When decomposing, ask: "Will 95% of users of this goal encounter this concern?"
- If YES: decompose it.
- If NO: mention it briefly in the parent's content as an edge case, don't create a child.

Examples of over-engineering to AVOID:
- CSV parser → UTF-16 detection (99% of CSVs are UTF-8)
- User login → biometric authentication (most apps use password)
- File upload → resumable chunked uploads (most uploads are small)
- API endpoint → GraphQL federation (most APIs are simple REST)

When you see a technically valid but practically rare concern:
1. Do NOT create a child node for it
2. Instead, add a brief note to the parent: "Edge case: [X] - handle if requirements demand it"
3. Move on to concerns that will actually matter

The goal is a spec that helps build the **80% case well**, not a spec that handles every edge case poorly.
Real developers ship the common case first. So should you.`;

/**
 * Build persuasive, socratic phase guidance for the system prompt.
 * This guidance is designed to convince, not command.
 */
function buildPhaseGuidance(colony: ColonyContext): string {
  const { phase, stats, targetDepth } = colony;

  const parts: string[] = [
    '',
    '## Colony State & Strategic Guidance',
    '',
    `The colony currently has ${stats.total_nodes} nodes with average confidence ${stats.avg_confidence}.`,
  ];

  // Depth reasoning
  if (targetDepth >= 6) {
    parts.push('');
    parts.push(`This target is at depth ${targetDepth}. Consider what this depth means:`);
    parts.push('- A specification that goes 6+ levels deep is approaching implementation detail.');
    parts.push('- At this granularity, a developer could likely write the code directly.');
    parts.push('- Further decomposition fragments the specification without adding clarity.');
    parts.push('- The question to ask: "Would another level of breakdown help a developer, or just create more nodes to track?"');
    parts.push('');
    parts.push('When a concern is granular enough to implement, the right action is to **deepen its content** or **settle it**, not to decompose further.');
  }

  parts.push('');

  switch (phase) {
    case 'germination':
      parts.push('**Colony Phase: Germination** (avg confidence < 3)');
      parts.push('');
      parts.push('The specification tree is young — mostly uncharted territory. This is the time for broad exploration.');
      parts.push('');
      parts.push('In this phase, DECOMPOSE serves the colony well:');
      parts.push('- High-level concerns need to be broken into tractable pieces.');
      parts.push('- The goal is to establish the shape of the problem space.');
      parts.push('- Each child should represent a genuinely distinct sub-concern.');
      parts.push('');
      parts.push('However, decomposition without substance is hollow. When you create children:');
      parts.push('- Give each child meaningful content (50+ words) that a developer could act on.');
      parts.push('- Avoid placeholder descriptions that merely restate the node name.');
      parts.push('- A node named "error-handling" with content "Handles errors" teaches nothing.');
      break;

    case 'foraging':
      parts.push('**Colony Phase: Foraging** (avg confidence 3-5)');
      parts.push('');
      parts.push('The colony has established territory. The question now is: which paths are worth reinforcing?');
      parts.push('');
      parts.push('This is a pivotal moment. The tree has structure, but much of it is uncertain. Consider:');
      parts.push('- Many branches exist but lack depth. Creating more branches spreads effort thin.');
      parts.push('- Confidence remains low across the tree. New decomposition adds nodes but not understanding.');
      parts.push('- The path to stability runs through consolidation, not expansion.');
      parts.push('');
      parts.push('The most valuable action now is typically **REVIEW**:');
      parts.push('- Assess whether existing children fully cover their parent\'s scope.');
      parts.push('- If coverage is complete, raise the parent\'s confidence.');
      parts.push('- If gaps exist, fill them with UPDATE_CONTENT or targeted decomposition.');
      parts.push('');
      parts.push('Ask yourself: "Does this node need more children, or do its existing children need more attention?"');
      break;

    case 'brood-care':
      parts.push('**Colony Phase: Brood Care** (avg confidence 5-7)');
      parts.push('');
      parts.push('The colony structure is established. Now comes the patient work of nurturing each node to maturity.');
      parts.push('');
      parts.push('At this phase, the tree\'s shape is largely set. What\'s missing is substance:');
      parts.push('- Many nodes have names and structure but lack implementable detail.');
      parts.push('- A developer reading this spec would know *what* to build but not *how*.');
      parts.push('- The gap between specification and implementation remains too wide.');
      parts.push('');
      parts.push('The most valuable action now is **UPDATE_CONTENT**:');
      parts.push('- Add concrete details: data formats, API shapes, validation rules.');
      parts.push('- Include edge cases and error conditions.');
      parts.push('- Write acceptance criteria a developer could verify.');
      parts.push('');
      parts.push('Decomposition at this phase is rarely the answer. If you find yourself wanting to decompose,');
      parts.push('ask: "Could I instead add this detail as content to the current node?"');
      break;

    case 'crystallization':
      parts.push('**Colony Phase: Crystallization** (avg confidence ≥ 7)');
      parts.push('');
      parts.push('The colony approaches stability. The work now is to solidify what exists.');
      parts.push('');
      parts.push('Most nodes should be ready to settle:');
      parts.push('- Content is specific enough for implementation.');
      parts.push('- Children fully cover the parent\'s scope.');
      parts.push('- No significant gaps or ambiguities remain.');
      parts.push('');
      parts.push('The action for this phase is **SETTLE**:');
      parts.push('- Raise confidence to 8-9 for nodes that are truly complete.');
      parts.push('- Reduce need to 1-2 for nodes requiring no further work.');
      parts.push('- A settled node is a promise: "This is ready for implementation."');
      parts.push('');
      parts.push('Only settle what you can honestly assess as complete. But if it is complete, settle it.');
      parts.push('The goal is a stable tree, not endless refinement.');
      break;
  }

  return parts.join('\n');
}

/**
 * Build the complete system prompt with phase guidance.
 */
function buildSystemPrompt(colony?: ColonyContext): string {
  if (!colony) return BASE_SYSTEM_PROMPT;
  return BASE_SYSTEM_PROMPT + buildPhaseGuidance(colony);
}

interface FlashResponse {
  reasoning: string;
  action: string;
  mutations: Array<{
    type: string;
    path: string;
    name?: string;
    content?: string;
    signals?: { need?: number; confidence?: number; conflict?: number };
  }>;
}

/**
 * FlashSpore: A real AI agent backed by Gemini Flash.
 *
 * Uses structured JSON output for reliable parsing. All signal values are
 * clamped to 0-10. CREATE_NODE paths are sanitized to be under the target.
 * DELETE_NODE is never allowed.
 */
export class FlashSpore implements Agent {
  readonly name = 'FlashSpore';
  readonly isRealAI = true;
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor(model = 'gemini-2.5-flash-lite', apiKey?: string) {
    const key = apiKey ?? process.env['GEMINI_API_KEY'];
    if (!key) {
      throw new Error(
        'GEMINI_API_KEY is required. Set it as an environment variable or pass it to the constructor.',
      );
    }
    this.ai = new GoogleGenAI({ apiKey: key });
    this.model = model;
  }

  async run(target: StigNode, context: string, children: StigNode[], colony?: ColonyContext): Promise<AgentResult> {
    const zeroCost: AgentCost = { api_calls: 1, input_tokens: 0, output_tokens: 0 };

    try {
      const userPrompt = buildPrompt(target, context, children, colony?.topLevelConcepts);
      const systemPrompt = buildSystemPrompt(colony);

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseJsonSchema: RESPONSE_SCHEMA,
          temperature: 0.3,
        },
      });

      const cost: AgentCost = {
        api_calls: 1,
        input_tokens: response.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      };

      const text = response.text;
      if (!text) {
        return { mutations: [], cost };
      }

      const parsed: FlashResponse = JSON.parse(text);
      const mutations = responseToMutations(parsed, target);

      return { mutations, cost };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { mutations: [], cost: zeroCost, error: msg };
    }
  }
}

/**
 * Build the user prompt from the target node, context chain, children, and top-level concepts.
 */
export function buildPrompt(
  target: StigNode,
  context: string,
  children: StigNode[],
  topLevelConcepts?: string[],
): string {
  const parts: string[] = [];

  parts.push('## Context Chain\n');
  parts.push(context);

  // Show existing top-level concepts for cross-branch awareness
  if (topLevelConcepts && topLevelConcepts.length > 0) {
    parts.push('\n## Existing Top-Level Concepts\n');
    parts.push('These concepts already exist at the top level of the tree:');
    parts.push(topLevelConcepts.map(c => `- ${c}`).join('\n'));
    parts.push('\n**Important:** If your decomposition would create something that overlaps with these, integrate with the existing concept instead of creating a duplicate.');
  }

  parts.push('\n## Target Node\n');
  parts.push(`Path: ${target.path}`);
  parts.push(`Name: ${target.name}`);
  parts.push(`Signals: need=${target.signals.need} confidence=${target.signals.confidence} conflict=${target.signals.conflict}`);
  if (target.content) {
    parts.push(`\nContent:\n${target.content}`);
  }

  if (children.length > 0) {
    parts.push('\n## Existing Children\n');
    for (const child of children) {
      parts.push(
        `- **${child.name}** (${child.path}) [need:${child.signals.need} confidence:${child.signals.confidence} conflict:${child.signals.conflict}]`,
      );
      if (child.content) {
        const firstLine = child.content.split('\n')[0];
        parts.push(`  ${firstLine}`);
      }
    }
  } else {
    parts.push('\nThis node has no children (leaf node).');
  }

  parts.push('\nAnalyze this node and respond with the appropriate action and mutations.');

  return parts.join('\n');
}

/**
 * Convert the AI's structured response into validated Mutation objects.
 */
export function responseToMutations(response: FlashResponse, target: StigNode): Mutation[] {
  const mutations: Mutation[] = [];
  let hasCreateNode = false;
  const seenCreatePaths = new Set<string>();

  for (const m of response.mutations) {
    if (m.type === 'DELETE_NODE') continue;
    if (!['CREATE_NODE', 'UPDATE_CONTENT', 'UPDATE_SIGNALS'].includes(m.type)) continue;

    if (m.type === 'CREATE_NODE') {
      const sanitized = sanitizeChildPath(m.path, target.path);
      if (!sanitized) continue;
      if (seenCreatePaths.has(sanitized)) continue;
      seenCreatePaths.add(sanitized);

      const signals = clampSignals(m.signals);
      mutations.push(
        createMutation('CREATE_NODE', sanitized, {
          name: m.name ?? sanitized.split('/').pop() ?? sanitized,
          content: m.content ?? '',
          signals: {
            need: signals.need ?? Math.max(3, target.signals.need - 1),
            confidence: signals.confidence ?? 0,
            conflict: signals.conflict ?? 0,
          },
        }),
      );
      hasCreateNode = true;
    } else if (m.type === 'UPDATE_CONTENT') {
      const path = m.path || target.path;
      mutations.push(
        createMutation('UPDATE_CONTENT', path, {
          content: m.content ?? '',
        }),
      );
    } else if (m.type === 'UPDATE_SIGNALS') {
      const path = m.path || target.path;
      const signals = clampSignals(m.signals);
      mutations.push(
        createMutation('UPDATE_SIGNALS', path, { signals }),
      );
    }
  }

  // Auto-append parent confidence bump when decomposition happens
  if (hasCreateNode) {
    mutations.push(
      createMutation('UPDATE_SIGNALS', target.path, {
        signals: { confidence: Math.min(10, target.signals.confidence + 2) },
      }),
    );
  }

  return mutations;
}

function sanitizeChildPath(childPath: string, targetPath: string): string | null {
  if (!childPath) return null;

  // Normalize: strip leading/trailing slashes, leading dots, and pure dot paths
  // Model often returns "./foo", ".root/foo", or ".foo" for root node children
  const normalized = childPath
    .replace(/^\/+|\/+$/g, '')  // leading/trailing slashes
    .replace(/^\.+\/?/, '')     // leading dots and optional slash (./foo, .foo, ..foo, .root/)
    .replace(/^\.+$/, '');      // pure dot paths like "." or ".."
  if (!normalized) return null;

  const prefix = targetPath === '.' ? '' : `${targetPath}/`;
  const targetSlug = targetPath === '.' ? '' : targetPath.split('/').pop() ?? '';

  if (prefix && normalized.startsWith(prefix)) {
    const remainder = normalized.slice(prefix.length);
    if (remainder && !remainder.includes('/')) {
      if (remainder === targetSlug) return null;
      return normalized;
    }
    return null;
  }

  if (!normalized.includes('/')) {
    if (normalized === targetSlug) return null;
    return prefix ? `${prefix}${normalized}` : normalized;
  }

  return null;
}

function clampSignals(
  signals?: { need?: number; confidence?: number; conflict?: number },
): { need?: number; confidence?: number; conflict?: number } {
  if (!signals) return {};
  const result: { need?: number; confidence?: number; conflict?: number } = {};
  if (signals.need !== undefined) result.need = clamp(signals.need, 0, 10);
  if (signals.confidence !== undefined) result.confidence = clamp(signals.confidence, 0, 10);
  if (signals.conflict !== undefined) result.conflict = clamp(signals.conflict, 0, 10);
  return result;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
