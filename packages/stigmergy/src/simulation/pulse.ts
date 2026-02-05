import { join } from 'node:path';
import { scanTree, findHighestPriority, getTreeStats, getColonyPhase, selectNHighestPriority } from '../tree/scanner.js';
import { buildFullContext, assembleContext } from '../tree/context-chain.js';
import { readNode, listChildren } from '../tree/node.js';
import { MutationDispatcher } from '../dispatch/dispatcher.js';
import { BudgetTracker } from '../budget/tracker.js';
import { Grazer } from '../agents/grazer.js';
import { Scout } from '../agents/scout.js';
import { Verifier } from '../agents/verifier.js';
import { createMutation } from '../dispatch/mutations.js';
import type { Agent } from '../agents/agent.js';
import type { BudgetSnapshot } from '../budget/tracker.js';
import type { MutationResult, WorkspaceConfig, TreeStats, StigNode } from '../types.js';

export interface PulseResult {
  pulse_number: number;
  target_path: string;
  target_name: string;
  agent: string;
  mutations_attempted: number;
  mutations_succeeded: number;
  skipped_overheated: number;
  errors: string[];
  agent_error?: string;
  cost: { api_calls: number; input_tokens: number; output_tokens: number };
  stats_after: TreeStats;
}

export type TerminationReason =
  | 'stable'
  | 'max_pulses'
  | 'no_target'
  | 'budget_exceeded';

export interface RunResult {
  pulses: PulseResult[];
  terminated_reason: TerminationReason;
  termination_detail?: string;
  total_pulses: number;
  final_stats: TreeStats;
  budget: BudgetSnapshot;
  pruned_nodes: number;
  scout_fixes: number;
  propagations: number;
  stability_checks: number;
  stability_failures: number;
  coverage_checks: number;
  coverage_failures: number;
}

/**
 * Check if the tree has reached stability.
 */
function isStable(config: WorkspaceConfig, workspacePath: string): boolean {
  const nodes = scanTree(workspacePath);
  const target = findHighestPriority(nodes);
  if (!target) return true;

  return (
    target.signals.need <= config.stability_threshold.need_max &&
    target.signals.confidence >= config.stability_threshold.confidence_min &&
    target.signals.conflict <= config.stability_threshold.conflict_max
  );
}

/**
 * Execute one pulse: scan → select → build context → run agent → dispatch mutations.
 * Now with budget tracking and temperature enforcement.
 *
 * @param targetPath - Optional pre-selected target path. If provided, skips target selection.
 */
export async function pulse(
  stigRoot: string,
  agent: Agent,
  pulseNumber: number,
  tracker?: BudgetTracker,
  targetPath?: string,
): Promise<PulseResult | null> {
  const workspacePath = join(stigRoot, 'workspace');
  const dispatcher = new MutationDispatcher(stigRoot);

  // Scan and select (or use provided target)
  const nodes = scanTree(workspacePath);
  let target: StigNode | null | undefined;

  if (targetPath) {
    target = nodes.find((n) => n.path === targetPath);
  } else {
    target = findHighestPriority(nodes);
  }

  if (!target) return null;

  // Build context (phase guidance now goes to system prompt via colony context)
  const { chain, siblings } = buildFullContext(workspacePath, target.path);
  const context = assembleContext(chain, siblings);
  const stats = getTreeStats(nodes);
  const phase = getColonyPhase(stats);
  const targetDepth = target.path === '.' ? 0 : target.path.split('/').length;
  const colony = { phase, stats, targetDepth };

  // Get existing children for the agent
  const childPaths = listChildren(workspacePath, target.path);
  const children = childPaths.map((cp) => readNode(workspacePath, cp));

  // Run agent with colony context for phase-aware behavior
  const agentResult = await agent.run(target, context, children, colony);

  // Dispatch mutations, respecting temperature limits
  const results: MutationResult[] = [];
  let skippedOverheated = 0;

  for (const mutation of agentResult.mutations) {
    // Check temperature before each mutation
    if (tracker && tracker.isNodeOverheated(mutation.path)) {
      skippedOverheated++;
      continue;
    }

    const result = dispatcher.dispatch(mutation);
    results.push(result);

    // Record mutation for temperature tracking
    if (result.success && tracker) {
      tracker.recordMutation(mutation.path);
    }
  }

  const succeeded = results.filter((r) => r.success).length;

  // If no mutations actually landed (empty result, all overheated, or all failed),
  // nudge signals so priority rotates away from this node.
  // Nudge scales with overheated count — heavy damping means the branch is saturated.
  // IMPORTANT: Nudge BOTH confidence up AND need down to prevent stuck states.
  if (succeeded === 0) {
    const nudgeAmount = 1 + Math.floor(skippedOverheated / 2);
    const nudgeDispatcher = new MutationDispatcher(stigRoot);
    const { createMutation } = await import('../dispatch/mutations.js');
    nudgeDispatcher.dispatch(
      createMutation('UPDATE_SIGNALS', target.path, {
        signals: {
          confidence: Math.min(10, target.signals.confidence + nudgeAmount),
          need: Math.max(1, target.signals.need - nudgeAmount),
        },
      }),
    );
  }

  const errors = results
    .filter((r) => !r.success)
    .map((r) => `${r.mutation.type} ${r.mutation.path}: ${r.error}`);

  // Record cost
  if (tracker) {
    tracker.record({
      pulse: pulseNumber,
      timestamp: new Date().toISOString(),
      api_calls: agentResult.cost.api_calls,
      input_tokens: agentResult.cost.input_tokens,
      output_tokens: agentResult.cost.output_tokens,
      agent: agent.name,
      target: target.path,
    });
  }

  // Get post-pulse stats
  const statsAfter = getTreeStats(scanTree(workspacePath));

  return {
    pulse_number: pulseNumber,
    target_path: target.path,
    target_name: target.name,
    agent: agent.name,
    mutations_attempted: agentResult.mutations.length,
    mutations_succeeded: succeeded,
    skipped_overheated: skippedOverheated,
    errors,
    agent_error: agentResult.error,
    cost: agentResult.cost,
    stats_after: statsAfter,
  };
}

/** How often to run maintenance agents (every N pulses) */
const MAINTENANCE_INTERVAL = 10;

interface PropagationResult {
  propagated: number;
  coverageChecks: number;
  coverageFailures: number;
}

/**
 * Propagate signals from children to parents.
 * If all children of a node are reasonably settled AND pass coverage assessment,
 * the parent's need should decrease. This drives convergence upward through the tree.
 */
async function propagateParentSignals(
  workspacePath: string,
  nodes: StigNode[],
  dispatcher: MutationDispatcher,
  verifier: Verifier | null,
  nodeMap: Map<string, StigNode>,
): Promise<PropagationResult> {
  let propagated = 0;
  let coverageChecks = 0;
  let coverageFailures = 0;

  for (const node of nodes) {
    if (node.path === '.') continue; // Skip root for child check

    const children = listChildren(workspacePath, node.path);
    if (children.length === 0) continue; // Leaf nodes don't propagate

    // Check if all children are reasonably settled
    const childNodes = children.map((cp) => nodeMap.get(cp)).filter((n): n is StigNode => n !== undefined);
    if (childNodes.length === 0) continue;

    const avgChildConfidence = childNodes.reduce((sum, c) => sum + c.signals.confidence, 0) / childNodes.length;
    const avgChildNeed = childNodes.reduce((sum, c) => sum + c.signals.need, 0) / childNodes.length;
    const maxChildConflict = Math.max(...childNodes.map((c) => c.signals.conflict));

    // If children are settled (avg confidence >= 6, avg need <= 4, no high conflict)
    // and parent has higher need or lower confidence, consider propagating
    if (avgChildConfidence >= 6 && avgChildNeed <= 4 && maxChildConflict <= 2) {
      const shouldReduceNeed = node.signals.need > Math.max(2, Math.ceil(avgChildNeed));
      const shouldBumpConfidence = node.signals.confidence < Math.min(8, Math.floor(avgChildConfidence));

      if (shouldReduceNeed || shouldBumpConfidence) {
        // LLM Coverage Gate: verify children actually cover parent scope
        if (verifier) {
          coverageChecks++;
          const coverage = await verifier.assessCoverage(node, childNodes);
          if (!coverage.is_covered && !coverage.error) {
            coverageFailures++;
            // Coverage failed - raise conflict on parent to attract attention
            dispatcher.dispatch(
              createMutation('UPDATE_SIGNALS', node.path, {
                signals: { conflict: Math.min(10, node.signals.conflict + 2) },
              }),
            );
            continue; // Skip propagation for this node
          }
        }

        const newSignals: { need?: number; confidence?: number } = {};
        if (shouldReduceNeed) newSignals.need = Math.max(2, node.signals.need - 2);
        if (shouldBumpConfidence) newSignals.confidence = Math.min(8, node.signals.confidence + 1);

        const result = dispatcher.dispatch(createMutation('UPDATE_SIGNALS', node.path, { signals: newSignals }));
        if (result.success) propagated++;
      }
    }
  }

  return { propagated, coverageChecks, coverageFailures };
}

/**
 * Run the simulation loop with full cost protection:
 * - Budget cap (API calls + tokens)
 * - Max pulses circuit breaker
 * - Node temperature / damping
 * - Stability detection
 * - Periodic necrophoresis (Grazer prunes dead nodes)
 */
export async function run(
  stigRoot: string,
  agent: Agent,
  config: WorkspaceConfig,
): Promise<RunResult> {
  const workspacePath = join(stigRoot, 'workspace');
  const tracker = new BudgetTracker(stigRoot, config.budget);
  tracker.initLog();

  const pulses: PulseResult[] = [];
  const grazer = new Grazer();
  const scout = new Scout();
  const dispatcher = new MutationDispatcher(stigRoot);
  let prunedNodes = 0;
  let scoutFixes = 0;
  let propagations = 0;
  let stabilityChecks = 0;
  let stabilityFailures = 0;
  let coverageChecks = 0;
  let coverageFailures = 0;

  // Initialize Verifier if API key available (optional LLM quality gates)
  const apiKey = process.env['GEMINI_API_KEY'];
  const verifier = apiKey ? new Verifier('gemini-2.5-flash-lite', apiKey) : null;

  const makeResult = (reason: TerminationReason, detail?: string): RunResult => ({
    pulses,
    terminated_reason: reason,
    termination_detail: detail,
    total_pulses: pulses.length,
    final_stats: getTreeStats(scanTree(workspacePath)),
    budget: tracker.snapshot(),
    pruned_nodes: prunedNodes,
    scout_fixes: scoutFixes,
    propagations,
    stability_checks: stabilityChecks,
    stability_failures: stabilityFailures,
    coverage_checks: coverageChecks,
    coverage_failures: coverageFailures,
  });

  for (let i = 1; i <= config.max_pulses; i++) {
    // Check stability
    if (isStable(config, workspacePath)) {
      return makeResult('stable');
    }

    // Check budget before each pulse
    const budgetCheck = tracker.checkBudget();
    if (budgetCheck) {
      return makeResult('budget_exceeded', budgetCheck);
    }

    const result = await pulse(stigRoot, agent, i, tracker);

    if (!result) {
      return makeResult('no_target');
    }

    pulses.push(result);

    // Maintenance cycle: run every N pulses
    if (i % MAINTENANCE_INTERVAL === 0) {
      const nodes = scanTree(workspacePath);
      const nodeMap = new Map(nodes.map((n) => [n.path, n]));

      // 1. LLM Stability Verification: check if "stable-looking" nodes are truly implementable
      if (verifier) {
        const stableThreshold = config.stability_threshold;
        const candidateNodes = nodes.filter(
          (n) =>
            n.signals.confidence >= stableThreshold.confidence_min &&
            n.signals.need <= stableThreshold.need_max &&
            n.signals.conflict <= stableThreshold.conflict_max &&
            listChildren(workspacePath, n.path).length === 0, // Only verify leaves
        );

        // Verify up to 3 candidates per maintenance cycle to limit cost
        const toVerify = candidateNodes.slice(0, 3);
        for (const node of toVerify) {
          stabilityChecks++;
          const verification = await verifier.verifyStability(node);
          if (!verification.is_implementable && !verification.error) {
            stabilityFailures++;
            // Knock it back: increase need, decrease confidence
            dispatcher.dispatch(
              createMutation('UPDATE_SIGNALS', node.path, {
                signals: {
                  need: Math.min(10, node.signals.need + 2),
                  confidence: Math.max(1, node.signals.confidence - 2),
                },
              }),
            );
          }
        }
      }

      // 2. Parent signal propagation with LLM coverage gate
      const propResult = await propagateParentSignals(workspacePath, nodes, dispatcher, verifier, nodeMap);
      propagations += propResult.propagated;
      coverageChecks += propResult.coverageChecks;
      coverageFailures += propResult.coverageFailures;

      // 3. Scout patrol (detect and flag problems)
      const scoutReport = scout.patrol(nodes);
      for (const mutation of scoutReport.mutations) {
        const fixResult = dispatcher.dispatch(mutation);
        if (fixResult.success) scoutFixes++;
      }

      // 4. Necrophoresis: Grazer prunes dead nodes
      const grazerReport = grazer.patrol(nodes, workspacePath, i);
      for (const mutation of grazerReport.mutations) {
        const pruneResult = dispatcher.dispatch(mutation);
        if (pruneResult.success) prunedNodes++;
      }
    }
  }

  // Final stability check after last pulse
  if (isStable(config, workspacePath)) {
    return makeResult('stable');
  }

  return makeResult('max_pulses');
}

/**
 * Execute multiple pulses in parallel on different targets.
 * Selects N non-sibling targets to minimize mutation conflicts.
 * Agent calls run concurrently, mutations dispatch sequentially.
 *
 * @param parallelCount - Number of agents to run in parallel (default 1)
 */
export async function batchPulse(
  stigRoot: string,
  agent: Agent,
  startPulseNumber: number,
  tracker: BudgetTracker,
  parallelCount = 1,
): Promise<PulseResult[]> {
  const workspacePath = join(stigRoot, 'workspace');

  // Select N targets (avoiding siblings to reduce conflict)
  const nodes = scanTree(workspacePath);
  const targets = selectNHighestPriority(nodes, parallelCount);

  if (targets.length === 0) return [];

  // Run agents in parallel
  const pulsePromises = targets.map((target, i) =>
    pulse(stigRoot, agent, startPulseNumber + i, tracker, target.path),
  );

  const results = await Promise.all(pulsePromises);

  // Filter out nulls (shouldn't happen since we pre-selected targets)
  return results.filter((r): r is PulseResult => r !== null);
}
