import type { Mutation, StigNode, TreeStats } from '../types.js';
import type { ColonyPhase } from '../tree/scanner.js';

/**
 * Cost report from an agent's run. Real agents report actual API usage.
 * MockSpore reports zeros.
 */
export interface AgentCost {
  api_calls: number;
  input_tokens: number;
  output_tokens: number;
}

/**
 * Result of an agent's run: mutations to apply + cost incurred.
 */
export interface AgentResult {
  mutations: Mutation[];
  cost: AgentCost;
  error?: string;
  action?: string; // Agent's chosen action (DECOMPOSE, REVIEW, UPDATE_CONTENT, SETTLE)
  reasoning?: string; // Agent's stated reasoning for the action
}

/**
 * Colony context passed to agents for phase-aware behavior.
 */
export interface ColonyContext {
  phase: ColonyPhase;
  stats: TreeStats;
  targetDepth: number;
  topLevelConcepts?: string[]; // Names of root's children for cross-branch awareness
}

/**
 * Agent interface: the contract between the simulation loop and any agent.
 *
 * An agent receives:
 * - target: the StigNode selected by the scanner
 * - context: the assembled context chain string (root → target + siblings)
 * - children: existing children of the target (so the agent knows what's already decomposed)
 * - colony: optional colony phase context for phase-aware behavior
 *
 * An agent returns:
 * - AgentResult: mutations to apply + cost report
 *
 * Agents are stateless. All state lives in the tree.
 */
export interface Agent {
  readonly name: string;
  readonly isRealAI: boolean;
  run(target: StigNode, context: string, children: StigNode[], colony?: ColonyContext): Promise<AgentResult>;
}
