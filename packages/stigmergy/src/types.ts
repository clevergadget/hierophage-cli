export interface NodeSignals {
  need: number; // 0-10, how important/blocking
  confidence: number; // 0-10, how settled
  conflict: number; // 0-10, contradictions present
  workers_active: number;
  last_pulse: string; // ISO timestamp
}

export interface NodeEvidence {
  acceptance_criteria: number;
  examples: number;
  risks: number;
  conflict_reasons?: string[]; // Why conflict was raised, for Resolver to read
}

export interface StigNode {
  path: string; // Relative to workspace root
  name: string; // Human-readable name
  signals: NodeSignals;
  evidence: NodeEvidence;
  content: string; // Markdown body
  isScaffold: boolean; // Pre-built structural node
}

export type MutationType =
  | 'CREATE_NODE'
  | 'UPDATE_CONTENT'
  | 'UPDATE_SIGNALS'
  | 'DELETE_NODE'
  | 'MERGE_NODES';

export interface MutationPayload {
  name?: string;
  signals?: Partial<NodeSignals>;
  evidence?: Partial<NodeEvidence>;
  content?: string;
  isScaffold?: boolean;
  conflict_reason?: string; // Appended to conflict_reasons array when raising conflict
  // For MERGE_NODES: sources to consume (will be deleted after merge)
  merge_sources?: string[];
}

export interface Mutation {
  type: MutationType;
  path: string;
  payload: MutationPayload;
  timestamp: string;
}

export interface MutationResult {
  success: boolean;
  error?: string;
  mutation: Mutation;
}

export interface BudgetConfig {
  max_api_calls: number;
  max_input_tokens: number;
  node_temperature_limit: number; // Max mutations per node per run before lockout
}

export interface WorkspaceConfig {
  model: string;
  max_concurrent_workers: number;
  workers_per_target: number;
  max_pulses: number;
  stability_threshold: {
    need_max: number;
    confidence_min: number;
    conflict_max: number;
  };
  cross_check: {
    pairs_per_pulse: number;
    min_tree_depth: number;
  };
  context_budget_tokens: number;
  foundation_path: string;
  budget: BudgetConfig;
}

export interface TreeStats {
  total_nodes: number;
  avg_confidence: number;
  avg_need: number;
  nodes_in_conflict: number;
  stable_count: number;
  scaffold_count: number;
}

export const DEFAULT_SIGNALS: NodeSignals = {
  need: 5,
  confidence: 0,
  conflict: 0,
  workers_active: 0,
  last_pulse: new Date().toISOString(),
};

export const SCAFFOLD_SIGNALS: NodeSignals = {
  need: 7,
  confidence: 0,
  conflict: 0,
  workers_active: 0,
  last_pulse: new Date().toISOString(),
};

export const DEFAULT_EVIDENCE: NodeEvidence = {
  acceptance_criteria: 0,
  examples: 0,
  risks: 0,
};

export const DEFAULT_BUDGET: BudgetConfig = {
  max_api_calls: 500,
  max_input_tokens: 1_000_000,
  node_temperature_limit: 5,
};

// --- Telemetry Types ---

export interface CostSummary {
  api_calls: number;
  input_tokens: number;
  output_tokens: number;
}

export type TelemetryEvent =
  | { type: 'run_start'; timestamp: string; pulse: number; goal: string; model: string; max_pulses: number; parallel: number }
  | { type: 'run_end'; timestamp: string; pulse: number; reason: TerminationReason; detail?: string; stats: TreeStats; cost: CostSummary }
  | { type: 'pulse'; timestamp: string; pulse: number; target: string; agent: string; action: string; reasoning?: string;
      mutations_attempted: number; mutations_succeeded: number; skipped_overheated: number;
      cost: CostSummary; phase: ColonyPhase; stats: TreeStats }
  | { type: 'phase_change'; timestamp: string; pulse: number; from: ColonyPhase; to: ColonyPhase; stats: TreeStats }
  | { type: 'scout'; timestamp: string; pulse: number; findings: { hollow: string[]; tautologies: string[]; similar: string[] }; fixes: number }
  | { type: 'grazer'; timestamp: string; pulse: number; pruned: string[] }
  | { type: 'verifier_stability'; timestamp: string; pulse: number; node: string; passed: boolean; reason?: string }
  | { type: 'verifier_coverage'; timestamp: string; pulse: number; node: string; passed: boolean; gaps?: string[] }
  | { type: 'propagation'; timestamp: string; pulse: number; node: string; need_delta: number; confidence_delta: number }
  | { type: 'resolver'; timestamp: string; pulse: number; node: string; resolved: boolean; conflict_before: number; conflict_after: number }
  | { type: 'synthesizer'; timestamp: string; pulse: number; target: string; sources: string[]; merged: boolean }
  | { type: 'evaporation'; timestamp: string; pulse: number; nodes_affected: number; avg_need_delta: number; avg_conflict_delta: number };

export type TerminationReason = 'stable' | 'max_pulses' | 'no_target' | 'budget_exceeded';

export type ColonyPhase = 'germination' | 'foraging' | 'brood-care' | 'crystallization';

export const DEFAULT_CONFIG: WorkspaceConfig = {
  model: 'gemini-2.5-flash-lite',
  max_concurrent_workers: 8,
  workers_per_target: 1,
  max_pulses: 100,
  stability_threshold: {
    need_max: 2,
    confidence_min: 8,
    conflict_max: 1,
  },
  cross_check: {
    pairs_per_pulse: 2,
    min_tree_depth: 2,
  },
  context_budget_tokens: 8000,
  foundation_path: 'docs/foundation.md',
  budget: DEFAULT_BUDGET,
};
