import { join } from 'node:path';
import { scanTree, findHighestPriority, getTreeStats, getColonyPhase, selectNHighestPriority } from '../tree/scanner.js';
import { buildFullContext, assembleContext } from '../tree/context-chain.js';
import { readNode, listChildren } from '../tree/node.js';
import { MutationDispatcher } from '../dispatch/dispatcher.js';
import { BudgetTracker } from '../budget/tracker.js';
import { Grazer } from '../agents/grazer.js';
import { Scout } from '../agents/scout.js';
import { Verifier } from '../agents/verifier.js';
import { Resolver } from '../agents/resolver.js';
import { Synthesizer } from '../agents/synthesizer.js';
import { Termite, sampleCrossBranchPairs } from '../agents/termite.js';
import { createMutation } from '../dispatch/mutations.js';
import { TelemetryEmitter } from './telemetry.js';
import type { Agent } from '../agents/agent.js';
import type { BudgetSnapshot } from '../budget/tracker.js';
import type { MutationResult, WorkspaceConfig, TreeStats, StigNode, TerminationReason, ColonyPhase } from '../types.js';

export interface PulseResult {
  pulse_number: number;
  target_path: string;
  target_name: string;
  agent: string;
  action?: string;
  reasoning?: string;
  mutations_attempted: number;
  mutations_succeeded: number;
  skipped_overheated: number;
  errors: string[];
  agent_error?: string;
  cost: { api_calls: number; input_tokens: number; output_tokens: number };
  stats_after: TreeStats;
  phase: ColonyPhase;
}

export type { TerminationReason } from '../types.js';

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
  resolver_attempts: number;
  resolver_resolutions: number;
  synthesis_merges: number;
  evaporations: number;
  termite_inspections: number;
  termite_detections: number;
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

  // Get top-level concepts for cross-branch awareness
  const topLevelConcepts = nodes
    .filter(n => n.path !== '.' && !n.path.includes('/'))
    .map(n => n.name);

  const colony = { phase, stats, targetDepth, topLevelConcepts };

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
    action: agentResult.action,
    reasoning: agentResult.reasoning,
    mutations_attempted: agentResult.mutations.length,
    mutations_succeeded: succeeded,
    skipped_overheated: skippedOverheated,
    errors,
    agent_error: agentResult.error,
    cost: agentResult.cost,
    stats_after: statsAfter,
    phase,
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
  telemetry?: TelemetryEmitter,
  currentPulse?: number,
): Promise<PropagationResult> {
  let propagated = 0;
  let coverageChecks = 0;
  let coverageFailures = 0;
  const ts = () => new Date().toISOString();

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

          telemetry?.emit({
            type: 'verifier_coverage', timestamp: ts(), pulse: currentPulse ?? 0,
            node: node.path, passed: coverage.is_covered, gaps: coverage.gaps,
          });

          if (!coverage.is_covered && !coverage.error) {
            coverageFailures++;
            // Coverage failed - raise conflict on parent to attract attention
            const gapsText = coverage.gaps?.length ? `: ${coverage.gaps.join(', ')}` : '';
            dispatcher.dispatch(
              createMutation('UPDATE_SIGNALS', node.path, {
                signals: { conflict: Math.min(10, node.signals.conflict + 2) },
                conflict_reason: `Verifier: Coverage gap - children don't fully cover parent scope${gapsText}. ${coverage.reasoning}`,
              }),
            );
            continue; // Skip propagation for this node
          }
        }

        const newSignals: { need?: number; confidence?: number } = {};
        if (shouldReduceNeed) newSignals.need = Math.max(2, node.signals.need - 2);
        if (shouldBumpConfidence) newSignals.confidence = Math.min(8, node.signals.confidence + 1);

        const result = dispatcher.dispatch(createMutation('UPDATE_SIGNALS', node.path, { signals: newSignals }));
        if (result.success) {
          propagated++;
          telemetry?.emit({
            type: 'propagation', timestamp: ts(), pulse: currentPulse ?? 0,
            node: node.path,
            need_delta: newSignals.need !== undefined ? newSignals.need - node.signals.need : 0,
            confidence_delta: newSignals.confidence !== undefined ? newSignals.confidence - node.signals.confidence : 0,
          });
        }
      }
    }
  }

  return { propagated, coverageChecks, coverageFailures };
}

/**
 * Evaporate signals on idle nodes.
 * Need and conflict decay on nodes that haven't been pulse targets recently.
 * Confidence does NOT decay — accumulated knowledge persists.
 *
 * @returns Number of nodes affected by evaporation.
 */
export interface EvaporationRates {
  needDecay: number;
  conflictDecay: number;
}

export const DEFAULT_EVAPORATION_RATES: EvaporationRates = { needDecay: 0.25, conflictDecay: 0.08 };

export function evaporateSignals(
  nodes: StigNode[],
  dispatcher: MutationDispatcher,
  recentTargets: Set<string>,
  currentPulse: number,
  telemetry?: TelemetryEmitter,
  rates: EvaporationRates = DEFAULT_EVAPORATION_RATES,
): number {
  const NEED_DECAY = rates.needDecay;
  const CONFLICT_DECAY = rates.conflictDecay;
  const ts = () => new Date().toISOString();

  let affected = 0;
  let totalNeedDelta = 0;
  let totalConflictDelta = 0;

  for (const node of nodes) {
    // Skip recently-touched nodes
    if (recentTargets.has(node.path)) continue;

    const needDecay = node.signals.need > 1 ? Math.min(NEED_DECAY, node.signals.need - 1) : 0;
    const conflictDecay = node.signals.conflict > 0 ? Math.min(CONFLICT_DECAY, node.signals.conflict) : 0;

    if (needDecay === 0 && conflictDecay === 0) continue;

    const newNeed = Math.round((node.signals.need - needDecay) * 100) / 100;
    const newConflict = Math.round((node.signals.conflict - conflictDecay) * 100) / 100;

    const signals: { need?: number; conflict?: number } = {};
    if (needDecay > 0) signals.need = Math.max(1, newNeed);
    if (conflictDecay > 0) signals.conflict = Math.max(0, newConflict);

    const result = dispatcher.dispatch(createMutation('UPDATE_SIGNALS', node.path, { signals }));
    if (result.success) {
      affected++;
      totalNeedDelta -= needDecay;
      totalConflictDelta -= conflictDecay;
    }
  }

  if (affected > 0 && telemetry) {
    telemetry.emit({
      type: 'evaporation',
      timestamp: ts(),
      pulse: currentPulse,
      nodes_affected: affected,
      avg_need_delta: Math.round((totalNeedDelta / affected) * 100) / 100,
      avg_conflict_delta: Math.round((totalConflictDelta / affected) * 100) / 100,
    });
  }

  return affected;
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

  // Initialize telemetry
  const telemetry = new TelemetryEmitter(stigRoot);
  const ts = () => new Date().toISOString();

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
  let resolverAttempts = 0;
  let resolverResolutions = 0;
  let synthesisMerges = 0;
  let evaporations = 0;
  let termiteInspections = 0;
  let termiteDetections = 0;

  // Initialize Verifier and Resolver if API key available
  const apiKey = process.env['GEMINI_API_KEY'];
  const verifier = apiKey ? new Verifier('gemini-2.5-flash-lite', apiKey) : null;
  const resolver = apiKey ? new Resolver('gemini-2.5-flash-lite', apiKey) : null;
  const synthesizer = apiKey ? new Synthesizer('gemini-2.5-flash-lite', apiKey) : null;
  const termite = apiKey ? new Termite('gemini-2.5-flash-lite', apiKey) : null;

  // Track phase for crystallization gate
  let lastPhase: ColonyPhase = 'germination';

  // Read root node for goal
  const rootNode = readNode(workspacePath, '.');
  const parallelCount = config.max_concurrent_workers || 1;

  // Emit run_start
  telemetry.emit({
    type: 'run_start', timestamp: ts(), pulse: 0,
    goal: rootNode.name || rootNode.content.split('\n')[0] || 'unknown',
    model: config.model, max_pulses: config.max_pulses, parallel: parallelCount,
  });

  const makeResult = (reason: TerminationReason, detail?: string): RunResult => {
    const finalStats = getTreeStats(scanTree(workspacePath));
    const budget = tracker.snapshot();

    // Emit run_end
    telemetry.emit({
      type: 'run_end', timestamp: ts(), pulse: pulses.length,
      reason, detail, stats: finalStats,
      cost: { api_calls: budget.total_api_calls, input_tokens: budget.total_input_tokens, output_tokens: budget.total_output_tokens },
    });

    return {
      pulses,
      terminated_reason: reason,
      termination_detail: detail,
      total_pulses: pulses.length,
      final_stats: finalStats,
      budget,
      pruned_nodes: prunedNodes,
      scout_fixes: scoutFixes,
      propagations,
      stability_checks: stabilityChecks,
      stability_failures: stabilityFailures,
      coverage_checks: coverageChecks,
      coverage_failures: coverageFailures,
      resolver_attempts: resolverAttempts,
      resolver_resolutions: resolverResolutions,
      synthesis_merges: synthesisMerges,
      evaporations,
      termite_inspections: termiteInspections,
      termite_detections: termiteDetections,
    };
  };

  let pulseNumber = 1;

  while (pulseNumber <= config.max_pulses) {
    // Check stability
    if (isStable(config, workspacePath)) {
      return makeResult('stable');
    }

    // Check budget before each batch
    const budgetCheck = tracker.checkBudget();
    if (budgetCheck) {
      return makeResult('budget_exceeded', budgetCheck);
    }

    // Run batch of pulses in parallel
    const batchResults = await batchPulse(stigRoot, agent, pulseNumber, tracker, parallelCount);

    if (batchResults.length === 0) {
      return makeResult('no_target');
    }

    pulses.push(...batchResults);

    // Emit pulse telemetry events + track phase changes
    for (const p of batchResults) {
      telemetry.emit({
        type: 'pulse', timestamp: ts(), pulse: p.pulse_number,
        target: p.target_path, agent: p.agent,
        action: p.action ?? 'unknown', reasoning: p.reasoning,
        mutations_attempted: p.mutations_attempted,
        mutations_succeeded: p.mutations_succeeded,
        skipped_overheated: p.skipped_overheated,
        cost: p.cost, phase: p.phase, stats: p.stats_after,
      });

      // Detect phase changes
      if (p.phase !== lastPhase) {
        telemetry.emit({
          type: 'phase_change', timestamp: ts(), pulse: p.pulse_number,
          from: lastPhase, to: p.phase, stats: p.stats_after,
        });
        lastPhase = p.phase;
      }
    }

    pulseNumber += batchResults.length;

    // Maintenance cycle: run every N pulses (check if we crossed a maintenance boundary)
    const prevTotal = pulses.length - batchResults.length;
    const crossedMaintenance = Math.floor(pulses.length / MAINTENANCE_INTERVAL) > Math.floor(prevTotal / MAINTENANCE_INTERVAL);
    if (crossedMaintenance) {
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

          telemetry.emit({
            type: 'verifier_stability', timestamp: ts(), pulse: pulses.length,
            node: node.path, passed: verification.is_implementable,
            reason: verification.reasoning,
          });

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
      const propResult = await propagateParentSignals(workspacePath, nodes, dispatcher, verifier, nodeMap, telemetry, pulses.length);
      propagations += propResult.propagated;
      coverageChecks += propResult.coverageChecks;
      coverageFailures += propResult.coverageFailures;

      // 2.5. Signal evaporation — decay need and conflict on idle nodes
      const recentTargets = new Set(pulses.slice(-MAINTENANCE_INTERVAL).map(p => p.target_path));
      const evapCount = evaporateSignals(nodes, dispatcher, recentTargets, pulses.length, telemetry);
      evaporations += evapCount;

      // 3. Scout patrol (detect and flag problems)
      const scoutReport = scout.patrol(nodes);
      let scoutFixesThisCycle = 0;
      for (const mutation of scoutReport.mutations) {
        const fixResult = dispatcher.dispatch(mutation);
        if (fixResult.success) {
          scoutFixes++;
          scoutFixesThisCycle++;
        }
      }
      telemetry.emit({
        type: 'scout', timestamp: ts(), pulse: pulses.length,
        findings: {
          hollow: scoutReport.hollowNodes,
          tautologies: scoutReport.tautologies,
          similar: scoutReport.similarSiblings.map(s => `${s.a} ~ ${s.b}`),
        },
        fixes: scoutFixesThisCycle,
      });

      // 4. Necrophoresis: Grazer prunes dead nodes
      const grazerReport = grazer.patrol(nodes, workspacePath, pulses.length);
      const prunedThisCycle: string[] = [];
      for (const mutation of grazerReport.mutations) {
        const pruneResult = dispatcher.dispatch(mutation);
        if (pruneResult.success) {
          prunedNodes++;
          prunedThisCycle.push(mutation.path);
        }
      }
      if (prunedThisCycle.length > 0) {
        telemetry.emit({
          type: 'grazer', timestamp: ts(), pulse: pulses.length,
          pruned: prunedThisCycle,
        });
      }

      // 5. Auto-Resolver: resolve conflicts when conditions trigger
      if (resolver) {
        const stats = getTreeStats(nodes);
        const currentPhase = getColonyPhase(stats);
        const conflictDensity = stats.total_nodes > 0 ? stats.nodes_in_conflict / stats.total_nodes : 0;

        // Determine if resolver should engage
        const enteredCrystallization = currentPhase === 'crystallization' && lastPhase !== 'crystallization';
        const highConflictDensity = conflictDensity > 0.05; // >5% nodes in conflict (lowered from 10%)
        const periodicSweep = Math.floor(pulses.length / 50) > Math.floor(prevTotal / 50); // Every 50 pulses
        const hasConflicts = stats.nodes_in_conflict > 0;

        // Triggers:
        // 1. Phase gate: entering crystallization with conflicts
        // 2. Conflict density: >5% nodes in conflict
        // 3. Periodic sweep: every 50 pulses, resolve any accumulated conflicts
        const shouldResolve = hasConflicts && (enteredCrystallization || highConflictDensity || periodicSweep);

        if (shouldResolve) {
          // Find conflict nodes, sorted by conflict level descending
          const conflictNodes = nodes
            .filter((n) => n.signals.conflict > 0)
            .sort((a, b) => b.signals.conflict - a.signals.conflict);

          // Resolve up to 5 per maintenance cycle
          const toResolve = conflictNodes.slice(0, 5);
          for (const node of toResolve) {
            resolverAttempts++;

            // Get siblings and parent for context
            const parentPath = node.path.includes('/') ? node.path.split('/').slice(0, -1).join('/') || '.' : '.';
            const siblings = nodes.filter(
              (n) => n.path !== node.path && n.path.startsWith(parentPath + '/') && !n.path.slice(parentPath.length + 1).includes('/'),
            );
            const parent = nodeMap.get(parentPath);

            const result = await resolver.resolve(node, siblings, parent?.content);

            const resolved = result.resolved && result.mutations.length > 0;
            if (resolved) {
              for (const mutation of result.mutations) {
                dispatcher.dispatch(mutation);
              }
              resolverResolutions++;
            }

            telemetry.emit({
              type: 'resolver', timestamp: ts(), pulse: pulses.length,
              node: node.path, resolved,
              conflict_before: node.signals.conflict,
              conflict_after: resolved ? 0 : node.signals.conflict,
            });
          }
        }

        lastPhase = currentPhase;
      }

      // 6. Synthesizer: merge stable semantic duplicates (every 10 pulses)
      const crossedSynthInterval = Math.floor(pulses.length / 10) > Math.floor(prevTotal / 10);
      if (synthesizer && crossedSynthInterval) {
        const freshNodes = scanTree(workspacePath);
        const synthResult = await synthesizer.synthesize(freshNodes, { maxGroups: 10 });
        for (const mutation of synthResult.mutations) {
          dispatcher.dispatch(mutation);
        }
        for (const group of synthResult.duplicateGroups) {
          telemetry.emit({
            type: 'synthesizer', timestamp: ts(), pulse: pulses.length,
            target: group.canonical,
            sources: group.paths.filter(p => p !== group.canonical),
            merged: group.action === 'synthesized',
          });
        }
        synthesisMerges += synthResult.duplicateGroups.filter(g => g.action === 'synthesized').length;
      }

      // 7. Termite: cross-branch mound inspection (detect cross-branch duplicates)
      if (termite) {
        const freshNodes = scanTree(workspacePath);
        const pairs = sampleCrossBranchPairs(freshNodes, config.cross_check.pairs_per_pulse, config.cross_check.min_tree_depth);

        for (const [nodeA, nodeB] of pairs) {
          termiteInspections++;
          const result = await termite.inspect(nodeA, nodeB);

          telemetry.emit({
            type: 'termite', timestamp: ts(), pulse: pulses.length,
            node_a: nodeA.path, node_b: nodeB.path,
            equivalent: result.are_equivalent,
            reasoning: result.reasoning,
          });

          if (result.are_equivalent && !result.error) {
            termiteDetections++;
            const reason = `Cross-branch duplicate: equivalent to "${nodeB.name}" (${nodeB.path}) — ${result.reasoning}`;
            const reasonB = `Cross-branch duplicate: equivalent to "${nodeA.name}" (${nodeA.path}) — ${result.reasoning}`;

            dispatcher.dispatch(createMutation('UPDATE_SIGNALS', nodeA.path, {
              signals: { conflict: Math.min(10, nodeA.signals.conflict + 2) },
              conflict_reason: reason,
            }));
            dispatcher.dispatch(createMutation('UPDATE_SIGNALS', nodeB.path, {
              signals: { conflict: Math.min(10, nodeB.signals.conflict + 2) },
              conflict_reason: reasonB,
            }));
          }
        }
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
