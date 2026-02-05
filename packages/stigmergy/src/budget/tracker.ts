import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BudgetConfig } from '../types.js';

export interface BudgetEntry {
  pulse: number;
  timestamp: string;
  api_calls: number;
  input_tokens: number;
  output_tokens: number;
  agent: string;
  target: string;
}

export interface BudgetSnapshot {
  total_api_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  entries: BudgetEntry[];
}

/**
 * BudgetTracker: Tracks API call count and token spend per run.
 *
 * - Records each pulse's cost
 * - Checks against hard caps before each pulse
 * - Persists to budget.log for observability
 * - Tracks node mutation counts for temperature/damping
 */
export class BudgetTracker {
  private readonly logPath: string;
  private totalApiCalls = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private readonly entries: BudgetEntry[] = [];
  private readonly nodeMutationCounts: Map<string, number> = new Map();
  private readonly config: BudgetConfig;

  constructor(stigRoot: string, config: BudgetConfig) {
    this.logPath = join(stigRoot, 'budget.log');
    this.config = config;
  }

  /**
   * Record a pulse's API cost. Called after each pulse completes.
   * For MockSpore, api_calls=0 and tokens=0 (no real API calls).
   */
  record(entry: BudgetEntry): void {
    this.totalApiCalls += entry.api_calls;
    this.totalInputTokens += entry.input_tokens;
    this.totalOutputTokens += entry.output_tokens;
    this.entries.push(entry);

    const line =
      `[${entry.timestamp}] pulse=${entry.pulse} agent=${entry.agent} target="${entry.target}" ` +
      `api_calls=${entry.api_calls} input_tokens=${entry.input_tokens} output_tokens=${entry.output_tokens} ` +
      `running_total_calls=${this.totalApiCalls} running_total_input=${this.totalInputTokens}\n`;
    appendFileSync(this.logPath, line, 'utf-8');
  }

  /**
   * Record a mutation to a specific node path. Used for temperature tracking.
   */
  recordMutation(nodePath: string): void {
    const count = this.nodeMutationCounts.get(nodePath) ?? 0;
    this.nodeMutationCounts.set(nodePath, count + 1);
  }

  /**
   * Check if a node has exceeded its temperature limit.
   */
  isNodeOverheated(nodePath: string): boolean {
    const count = this.nodeMutationCounts.get(nodePath) ?? 0;
    return count >= this.config.node_temperature_limit;
  }

  /**
   * Get the mutation count for a node (its "temperature").
   */
  getNodeTemperature(nodePath: string): number {
    return this.nodeMutationCounts.get(nodePath) ?? 0;
  }

  /**
   * Check if the next pulse would exceed the budget.
   * Returns null if within budget, or a reason string if exceeded.
   */
  checkBudget(): string | null {
    if (this.totalApiCalls >= this.config.max_api_calls) {
      return `API call limit reached: ${this.totalApiCalls}/${this.config.max_api_calls}`;
    }
    if (this.totalInputTokens >= this.config.max_input_tokens) {
      return `Input token limit reached: ${this.totalInputTokens}/${this.config.max_input_tokens}`;
    }
    return null;
  }

  /**
   * Get current budget snapshot.
   */
  snapshot(): BudgetSnapshot {
    return {
      total_api_calls: this.totalApiCalls,
      total_input_tokens: this.totalInputTokens,
      total_output_tokens: this.totalOutputTokens,
      entries: [...this.entries],
    };
  }

  /**
   * Get all overheated nodes and their temperatures.
   */
  getOverheatedNodes(): Array<{ path: string; mutations: number }> {
    const result: Array<{ path: string; mutations: number }> = [];
    for (const [path, count] of this.nodeMutationCounts) {
      if (count >= this.config.node_temperature_limit) {
        result.push({ path, mutations: count });
      }
    }
    return result;
  }

  /**
   * Initialize the budget log for a new run.
   */
  initLog(): void {
    const header =
      `# Budget Log - ${new Date().toISOString()}\n` +
      `# Limits: max_api_calls=${this.config.max_api_calls} ` +
      `max_input_tokens=${this.config.max_input_tokens} ` +
      `node_temperature_limit=${this.config.node_temperature_limit}\n`;
    writeFileSync(this.logPath, header, 'utf-8');
  }
}
