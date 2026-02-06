// Core types
export type {
  NodeSignals,
  NodeEvidence,
  StigNode,
  MutationType,
  MutationPayload,
  Mutation,
  MutationResult,
  BudgetConfig,
  WorkspaceConfig,
  TreeStats,
  CostSummary,
  TelemetryEvent,
  TerminationReason,
  ColonyPhase,
} from './types.js';

export {
  DEFAULT_SIGNALS,
  SCAFFOLD_SIGNALS,
  DEFAULT_EVIDENCE,
  DEFAULT_BUDGET,
  DEFAULT_CONFIG,
} from './types.js';

// Tree operations
export { parseNode, parseNodeContent, serializeNode, readNode, writeNode, listChildren, nodeExists } from './tree/node.js';
export { buildContextChain, assembleContext, buildFullContext } from './tree/context-chain.js';
export { scanTree, findHighestPriority, getTreeStats, getColonyPhase, buildPhaseGuidance, selectNHighestPriority } from './tree/scanner.js';
// ColonyPhase now exported from types.js above

// Dispatch
export { MutationDispatcher } from './dispatch/dispatcher.js';
export { createMutation, validateMutation } from './dispatch/mutations.js';

// Budget
export { BudgetTracker } from './budget/tracker.js';
export type { BudgetEntry, BudgetSnapshot } from './budget/tracker.js';

// Agents
export type { Agent, AgentCost, AgentResult, ColonyContext, OverlapReport } from './agents/agent.js';
export { MockSpore } from './agents/mock-spore.js';
export { FlashSpore } from './agents/flash-spore.js';
export { Scout } from './agents/scout.js';
export type { ScoutReport } from './agents/scout.js';
export { Grazer } from './agents/grazer.js';
export type { GrazerReport } from './agents/grazer.js';
export { Resolver } from './agents/resolver.js';
export type { ResolverResult } from './agents/resolver.js';
export { Verifier } from './agents/verifier.js';
export type { StabilityVerification, CoverageAssessment } from './agents/verifier.js';
export { GoalAnalyst } from './agents/goal-analyst.js';
export type { SpecialConcern, GoalAnalysis } from './agents/goal-analyst.js';

// Simulation
export { pulse, run, batchPulse } from './simulation/pulse.js';
export { TelemetryEmitter, parseTelemetryLog } from './simulation/telemetry.js';
export type { PulseResult, RunResult } from './simulation/pulse.js';
// TerminationReason now exported from types.js above

// Crystallizer
export { Crystallizer } from './crystal/crystallizer.js';
export { MockCrystallizer, groupByBranch } from './crystal/mock-crystallizer.js';
export type { CrystalResult, CrystallizeResult, CrystallizerOptions } from './crystal/mock-crystallizer.js';
export { CRYSTALLIZER_SYSTEM_PROMPT, buildBranchPrompt, buildOverviewPrompt, formatNodesForPrompt, diagnoseTreeHealth, formatHealthReport } from './crystal/prompts.js';
export type { TreeHealthIssue } from './crystal/prompts.js';
