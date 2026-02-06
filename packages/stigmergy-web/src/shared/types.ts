/** Shared types between client and server */

export interface VizNode {
  name: string;
  path: string;
  need: number;
  confidence: number;
  conflict: number;
  conflictReasons: string[];
  isScaffold: boolean;
  isPlaceholder: boolean;
  content: string;
  children: VizNode[];
}

export interface WorkspaceInfo {
  exists: boolean;
  goal?: string;
  nodeCount?: number;
}

export interface StatusResponse {
  stats: {
    total_nodes: number;
    avg_confidence: number;
    avg_need: number;
    nodes_in_conflict: number;
    stable_count: number;
    scaffold_count: number;
  };
  phase: string;
}

export interface InitRequest {
  goal: string;
  context?: string[];
  analyze?: boolean;
}

export interface RunRequest {
  maxPulses?: number;
  parallel?: number;
  dryRun?: boolean;
}

export interface RunStatus {
  active: boolean;
  pulseCount: number;
  phase?: string;
  startedAt?: string;
}

export interface ConfigResponse {
  model: string;
  max_concurrent_workers: number;
  max_pulses: number;
  stability_threshold: {
    need_max: number;
    confidence_min: number;
    conflict_max: number;
  };
  budget: {
    max_api_calls: number;
    max_input_tokens: number;
    node_temperature_limit: number;
  };
}

export interface NodeDetail {
  name: string;
  path: string;
  signals: {
    need: number;
    confidence: number;
    conflict: number;
    workers_active: number;
    last_pulse: string;
  };
  evidence: {
    acceptance_criteria: number;
    examples: number;
    risks: number;
    conflict_reasons?: string[];
  };
  content: string;
  isScaffold: boolean;
  children: string[];
}

/** SSE event types streamed during a run */
export type StreamEvent =
  | { type: 'pulse'; data: PulseEvent }
  | { type: 'phase_change'; data: { from: string; to: string } }
  | { type: 'maintenance'; data: MaintenanceEvent }
  | { type: 'run_end'; data: { reason: string; detail?: string } }
  | { type: 'error'; data: { message: string } };

export interface PulseEvent {
  pulse: number;
  target: string;
  action: string;
  reasoning?: string;
  mutations_attempted: number;
  mutations_succeeded: number;
  cost: { api_calls: number; input_tokens: number; output_tokens: number };
  phase: string;
  stats: {
    total_nodes: number;
    avg_confidence: number;
    nodes_in_conflict: number;
    stable_count: number;
  };
}

export interface MaintenanceEvent {
  agent: string;
  details: Record<string, unknown>;
}
