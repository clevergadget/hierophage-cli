import { GoogleGenAI } from '@google/genai';
import type { AgentCost } from './agent.js';
import type { StigNode } from '../types.js';

/**
 * Result from stability verification.
 */
export interface StabilityVerification {
  node_path: string;
  is_implementable: boolean;
  reasoning: string;
  missing?: string[];
  cost: AgentCost;
  error?: string;
}

/**
 * Result from coverage assessment.
 */
export interface CoverageAssessment {
  parent_path: string;
  is_covered: boolean;
  reasoning: string;
  gaps?: string[];
  cost: AgentCost;
  error?: string;
}

const STABILITY_SCHEMA = {
  type: 'object',
  properties: {
    is_implementable: {
      type: 'boolean',
      description: 'Whether a developer could implement this without clarifying questions',
    },
    reasoning: {
      type: 'string',
      description: 'Brief explanation of the assessment',
    },
    missing: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of missing details if not implementable',
    },
  },
  required: ['is_implementable', 'reasoning'],
};

const COVERAGE_SCHEMA = {
  type: 'object',
  properties: {
    is_covered: {
      type: 'boolean',
      description: 'Whether the children fully cover the parent scope',
    },
    reasoning: {
      type: 'string',
      description: 'Brief explanation of the assessment',
    },
    gaps: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of gaps or missing concerns if not fully covered',
    },
  },
  required: ['is_covered', 'reasoning'],
};

const STABILITY_PROMPT = `You are a specification quality gate. You receive a node from a specification tree.

Your job is to answer ONE question: Could a developer implement this without asking clarifying questions?

A node is implementable if it includes:
- Concrete details (not just abstract descriptions)
- Specific formats, types, or structures where relevant
- Clear acceptance criteria or expected behavior
- Edge cases or error conditions addressed

A node is NOT implementable if:
- It's vague or abstract ("handles the data appropriately")
- It restates its name without adding detail
- It leaves key decisions unspecified
- A developer would need to ask "but how exactly?"

Be strict. Most nodes are not truly implementable.`;

const COVERAGE_PROMPT = `You are a specification coverage assessor. You receive a parent node and its children.

Your job is to answer ONE question: Do the children fully cover everything the parent requires?

Full coverage means:
- Every aspect mentioned in the parent has a corresponding child
- No significant concerns are missing
- The children together address the parent's complete scope

NOT full coverage if:
- The parent mentions something no child addresses
- There are obvious gaps (e.g., parent says "input and output" but only input has a child)
- Children overlap heavily but miss aspects of the parent

Be thorough. Look for gaps.`;

/**
 * Verifier: LLM-powered quality gates for the specification tree.
 *
 * Two functions:
 * 1. verifyStability - Is this node truly implementable?
 * 2. assessCoverage - Do children fully cover parent scope?
 */
export class Verifier {
  readonly name = 'Verifier';
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor(model = 'gemini-2.5-flash-lite', apiKey?: string) {
    const key = apiKey ?? process.env['GEMINI_API_KEY'];
    if (!key) {
      throw new Error('GEMINI_API_KEY is required for Verifier.');
    }
    this.ai = new GoogleGenAI({ apiKey: key });
    this.model = model;
  }

  /**
   * Verify if a node is truly implementable (stability gate).
   */
  async verifyStability(node: StigNode): Promise<StabilityVerification> {
    const zeroCost: AgentCost = { api_calls: 1, input_tokens: 0, output_tokens: 0 };

    try {
      const prompt = buildStabilityPrompt(node);

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction: STABILITY_PROMPT,
          responseMimeType: 'application/json',
          responseJsonSchema: STABILITY_SCHEMA,
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
        return { node_path: node.path, is_implementable: false, reasoning: 'No response', cost };
      }

      const parsed = JSON.parse(text) as {
        is_implementable: boolean;
        reasoning: string;
        missing?: string[];
      };

      return {
        node_path: node.path,
        is_implementable: parsed.is_implementable,
        reasoning: parsed.reasoning,
        missing: parsed.missing,
        cost,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { node_path: node.path, is_implementable: false, reasoning: '', cost: zeroCost, error: msg };
    }
  }

  /**
   * Assess if children fully cover parent scope (coverage gate).
   */
  async assessCoverage(parent: StigNode, children: StigNode[]): Promise<CoverageAssessment> {
    const zeroCost: AgentCost = { api_calls: 1, input_tokens: 0, output_tokens: 0 };

    if (children.length === 0) {
      return {
        parent_path: parent.path,
        is_covered: false,
        reasoning: 'No children to assess',
        cost: zeroCost,
      };
    }

    try {
      const prompt = buildCoveragePrompt(parent, children);

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction: COVERAGE_PROMPT,
          responseMimeType: 'application/json',
          responseJsonSchema: COVERAGE_SCHEMA,
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
        return { parent_path: parent.path, is_covered: false, reasoning: 'No response', cost };
      }

      const parsed = JSON.parse(text) as {
        is_covered: boolean;
        reasoning: string;
        gaps?: string[];
      };

      return {
        parent_path: parent.path,
        is_covered: parsed.is_covered,
        reasoning: parsed.reasoning,
        gaps: parsed.gaps,
        cost,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { parent_path: parent.path, is_covered: false, reasoning: '', cost: zeroCost, error: msg };
    }
  }
}

function buildStabilityPrompt(node: StigNode): string {
  const parts: string[] = [];

  parts.push('## Node to Verify\n');
  parts.push(`Path: ${node.path}`);
  parts.push(`Name: ${node.name}`);
  parts.push(`Signals: need=${node.signals.need} confidence=${node.signals.confidence} conflict=${node.signals.conflict}`);
  parts.push(`\nContent:\n${node.content || '(empty)'}`);
  parts.push('\nIs this node implementable? Could a developer build this without asking questions?');

  return parts.join('\n');
}

function buildCoveragePrompt(parent: StigNode, children: StigNode[]): string {
  const parts: string[] = [];

  parts.push('## Parent Node\n');
  parts.push(`Path: ${parent.path}`);
  parts.push(`Name: ${parent.name}`);
  parts.push(`\nContent:\n${parent.content || '(empty)'}`);

  parts.push('\n## Children\n');
  for (const child of children) {
    parts.push(`### ${child.name}`);
    parts.push(`Path: ${child.path}`);
    parts.push(`Content: ${child.content || '(empty)'}`);
    parts.push('');
  }

  parts.push('Do these children fully cover everything the parent requires?');

  return parts.join('\n');
}
