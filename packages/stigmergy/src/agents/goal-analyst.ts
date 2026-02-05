import { GoogleGenAI } from '@google/genai';
import type { AgentCost } from './agent.js';

/**
 * A special concern identified for a goal.
 */
export interface SpecialConcern {
  name: string;
  description: string;
}

/**
 * Result from goal analysis.
 */
export interface GoalAnalysis {
  concerns: SpecialConcern[];
  reasoning: string;
  cost: AgentCost;
  error?: string;
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reasoning: {
      type: 'string',
      description: 'Brief explanation of why these concerns matter for this specific goal',
    },
    concerns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Short kebab-case name for the concern (e.g., "overflow-handling")',
          },
          description: {
            type: 'string',
            description: 'One sentence explaining what makes this concern special for this goal',
          },
        },
        required: ['name', 'description'],
      },
      description: 'List of 0-3 special concerns. Empty array if the goal is straightforward.',
    },
  },
  required: ['reasoning', 'concerns'],
};

const SYSTEM_PROMPT = `You are a goal analyst for a specification system. You identify what makes a goal NON-TRIVIAL.

Your job: Given a goal, identify 0-3 SPECIAL CONCERNS that make it harder than it looks.

CRITICAL RULES:
1. Do NOT list generic software engineering concerns that apply to everything
2. Only list concerns that are SPECIFIC to THIS goal
3. For simple goals, return an EMPTY array
4. A "special concern" is something a developer would say "oh wait, we need to think about X"

NEVER include these generic concerns (they apply to everything):
- "testing" (everything needs tests)
- "error handling" (everything has errors)
- "deployment" (everything gets deployed)
- "documentation" (everything needs docs)
- "performance" (everything should be fast)
- "security" (everything should be secure)
- "user experience" (everything has users)

ONLY include concerns that are UNUSUAL for the goal:
- "add two numbers" → maybe "numeric overflow" IF the domain involves large numbers, otherwise NOTHING
- "parse CSV file" → "malformed input handling", "encoding detection"
- "user authentication" → "password hashing", "session invalidation", "brute force protection"
- "real-time chat" → "message ordering", "connection recovery", "presence detection"
- "payment processing" → "idempotency", "audit trail", "partial failure handling"

For a pure function with no I/O, state, or external dependencies, the answer is often an EMPTY array.

Be AGGRESSIVE about returning empty arrays. Most simple goals need NO special scaffolds.`;

/**
 * GoalAnalyst: Analyzes a goal to identify what makes it non-trivial.
 * Used at init time to create targeted scaffolds instead of generic ones.
 */
export class GoalAnalyst {
  readonly name = 'GoalAnalyst';
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor(model = 'gemini-2.5-flash-lite', apiKey?: string) {
    const key = apiKey ?? process.env['GEMINI_API_KEY'];
    if (!key) {
      throw new Error('GEMINI_API_KEY is required for GoalAnalyst.');
    }
    this.ai = new GoogleGenAI({ apiKey: key });
    this.model = model;
  }

  /**
   * Analyze a goal and identify special concerns.
   */
  async analyze(goal: string): Promise<GoalAnalysis> {
    const zeroCost: AgentCost = { api_calls: 1, input_tokens: 0, output_tokens: 0 };

    try {
      const prompt = `Analyze this goal and identify what makes it non-trivial (if anything):

"${goal}"

Remember: Return an EMPTY concerns array if this is a straightforward goal with no special considerations.`;

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseJsonSchema: RESPONSE_SCHEMA,
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
        return { concerns: [], reasoning: 'No response', cost };
      }

      const parsed = JSON.parse(text) as {
        reasoning: string;
        concerns: SpecialConcern[];
      };

      // Enforce max 3 concerns
      const concerns = parsed.concerns.slice(0, 3);

      return {
        concerns,
        reasoning: parsed.reasoning,
        cost,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { concerns: [], reasoning: '', cost: zeroCost, error: msg };
    }
  }
}
