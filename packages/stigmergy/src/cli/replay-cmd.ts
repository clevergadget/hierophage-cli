import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { parseTelemetryLog } from '../simulation/telemetry.js';
import type { TelemetryEvent, ColonyPhase } from '../types.js';

export interface ReplayOptions {
  node?: string;
  pulse?: number;
  maintenance?: boolean;
  agent?: string;
}

export function replayCommand(stigRoot: string, options: ReplayOptions): void {
  const telemetryPath = join(stigRoot, 'telemetry.jsonl');

  if (!existsSync(telemetryPath)) {
    console.error(chalk.red('No telemetry found. Run `stig run` first to generate telemetry data.'));
    process.exit(1);
  }

  const events = parseTelemetryLog(telemetryPath);
  if (events.length === 0) {
    console.error(chalk.red('Telemetry file is empty. Run `stig run` first.'));
    process.exit(1);
  }

  if (options.node) {
    renderNodeHistory(events, options.node);
  } else if (options.pulse !== undefined) {
    renderPulseDetail(events, options.pulse);
  } else if (options.maintenance) {
    renderMaintenanceView(events);
  } else if (options.agent) {
    renderAgentFilter(events, options.agent);
  } else {
    renderTimeline(events);
  }
}

// --- Timeline View (default) ---

function renderTimeline(events: TelemetryEvent[]): void {
  const runStart = events.find(e => e.type === 'run_start');
  const runEnd = events.find(e => e.type === 'run_end');
  const pulseEvents = events.filter(e => e.type === 'pulse') as Extract<TelemetryEvent, { type: 'pulse' }>[];
  const phaseChanges = events.filter(e => e.type === 'phase_change') as Extract<TelemetryEvent, { type: 'phase_change' }>[];

  // Header
  console.log(chalk.bold('Stigmergy Run Replay'));
  if (runStart && runStart.type === 'run_start') {
    console.log(chalk.dim(`Goal: ${runStart.goal}`));
  }

  const totalPulses = pulseEvents.length;
  const totalPhaseChanges = phaseChanges.length;
  const termReason = runEnd?.type === 'run_end' ? runEnd.reason : 'unknown';
  const totalCost = runEnd?.type === 'run_end' ? formatCost(runEnd.cost.input_tokens, runEnd.cost.output_tokens) : '?';

  console.log(chalk.dim(`${totalPulses} pulses | ${totalPhaseChanges} phase transitions | ${termReason} | ${totalCost}`));
  console.log('');

  // Group pulses by phase
  const phases = buildPhaseGroups(pulseEvents, phaseChanges);

  for (const group of phases) {
    // Phase header
    const phaseLabel = group.phase.toUpperCase();
    const pulseRange = `pulses ${group.startPulse}-${group.endPulse}`;
    const confStart = group.startConfidence.toFixed(1);
    const confEnd = group.endConfidence.toFixed(1);
    console.log(chalk.bold(`${phaseLabel} (${pulseRange}, avg confidence ${confStart} → ${confEnd})`));
    console.log(chalk.dim('─'.repeat(60)));
    console.log('');

    // Pulse lines
    for (const p of group.pulses) {
      const num = String(p.pulse).padStart(3);
      const actionLabel = formatAction(p);
      const costStr = chalk.dim(`[$${estimatePulseCost(p.cost.input_tokens, p.cost.output_tokens)}]`);
      console.log(`  ${num}  ${chalk.cyan(p.agent)} → ${chalk.bold(p.target.split('/').pop() || p.target)}  ${actionLabel}  ${costStr}`);
    }

    // Maintenance events at the end of each phase group
    const maintenanceInPhase = getMaintenanceEventsInRange(events, group.startPulse, group.endPulse);
    for (const me of maintenanceInPhase) {
      console.log(`     ${chalk.dim('┆')} ${formatMaintenanceEvent(me)}`);
    }

    console.log('');
  }

  // Summary
  const summaryParts: string[] = [];
  const nodeCount = runEnd?.type === 'run_end' ? String(runEnd.stats.total_nodes) : '?';
  summaryParts.push(`${nodeCount} nodes`);
  summaryParts.push(totalCost);

  const prunedCount = events.filter(e => e.type === 'grazer').reduce((sum, e) => sum + (e.type === 'grazer' ? e.pruned.length : 0), 0);
  if (prunedCount > 0) summaryParts.push(`${prunedCount} pruned`);

  const scoutFixes = events.filter(e => e.type === 'scout').reduce((sum, e) => sum + (e.type === 'scout' ? e.fixes : 0), 0);
  if (scoutFixes > 0) summaryParts.push(`${scoutFixes} scout fixes`);

  const mergeCount = events.filter(e => e.type === 'synthesizer' && e.merged).length;
  if (mergeCount > 0) summaryParts.push(`${mergeCount} merges`);

  const propCount = events.filter(e => e.type === 'propagation').length;
  if (propCount > 0) summaryParts.push(`${propCount} propagations`);

  const overlapCount = events.filter(e => e.type === 'flash_overlap').length;
  if (overlapCount > 0) summaryParts.push(`${overlapCount} overlaps`);

  console.log(chalk.dim(`Summary: ${summaryParts.join(' | ')}`));
}

interface PhaseGroup {
  phase: ColonyPhase;
  startPulse: number;
  endPulse: number;
  startConfidence: number;
  endConfidence: number;
  pulses: Extract<TelemetryEvent, { type: 'pulse' }>[];
}

function buildPhaseGroups(
  pulseEvents: Extract<TelemetryEvent, { type: 'pulse' }>[],
  phaseChanges: Extract<TelemetryEvent, { type: 'phase_change' }>[],
): PhaseGroup[] {
  if (pulseEvents.length === 0) return [];

  const groups: PhaseGroup[] = [];
  let currentPhase: ColonyPhase = pulseEvents[0].phase;
  let currentPulses: Extract<TelemetryEvent, { type: 'pulse' }>[] = [];

  for (const p of pulseEvents) {
    if (p.phase !== currentPhase && currentPulses.length > 0) {
      groups.push(makePhaseGroup(currentPhase, currentPulses));
      currentPulses = [];
      currentPhase = p.phase;
    }
    currentPulses.push(p);
  }

  if (currentPulses.length > 0) {
    groups.push(makePhaseGroup(currentPhase, currentPulses));
  }

  return groups;
}

function makePhaseGroup(phase: ColonyPhase, pulses: Extract<TelemetryEvent, { type: 'pulse' }>[]): PhaseGroup {
  return {
    phase,
    startPulse: pulses[0].pulse,
    endPulse: pulses[pulses.length - 1].pulse,
    startConfidence: pulses[0].stats.avg_confidence,
    endConfidence: pulses[pulses.length - 1].stats.avg_confidence,
    pulses,
  };
}

function formatAction(p: Extract<TelemetryEvent, { type: 'pulse' }>): string {
  const action = p.action || 'unknown';
  switch (action) {
    case 'DECOMPOSE':
      return chalk.green(`DECOMPOSE  +${p.mutations_attempted - 1} children`);
    case 'REVIEW':
      return chalk.blue('REVIEW     updated');
    case 'UPDATE_CONTENT':
      return chalk.yellow('UPDATE     deepened');
    case 'SETTLE':
      return chalk.magenta('SETTLE     confidence → high');
    default:
      return chalk.dim(action);
  }
}

function formatMaintenanceEvent(event: TelemetryEvent): string {
  switch (event.type) {
    case 'scout':
      if (event.fixes === 0 && event.findings.hollow.length === 0 && event.findings.tautologies.length === 0) return '';
      return chalk.yellow(`Scout: ${event.fixes} fixes (${event.findings.hollow.length} hollow, ${event.findings.tautologies.length} tautologies)`);
    case 'grazer':
      return chalk.magenta(`Grazer: pruned ${event.pruned.join(', ')}`);
    case 'verifier_stability':
      return event.passed
        ? chalk.green(`Verifier: ${shortPath(event.node)} stability PASSED`)
        : chalk.red(`Verifier: ${shortPath(event.node)} stability FAILED — ${event.reason || 'no reason'}`);
    case 'verifier_coverage':
      return event.passed
        ? chalk.green(`Verifier: ${shortPath(event.node)} coverage PASSED`)
        : chalk.red(`Verifier: ${shortPath(event.node)} coverage FAILED — gaps: ${event.gaps?.join(', ') || 'unknown'}`);
    case 'propagation':
      return chalk.cyan(`Propagation: ${shortPath(event.node)} need${event.need_delta >= 0 ? '+' : ''}${event.need_delta} conf${event.confidence_delta >= 0 ? '+' : ''}${event.confidence_delta}`);
    case 'resolver':
      return event.resolved
        ? chalk.blue(`Resolver: ${shortPath(event.node)} [${event.conflict_before}] → resolved [${event.conflict_after}]`)
        : chalk.dim(`Resolver: ${shortPath(event.node)} [${event.conflict_before}] → unresolved`);
    case 'synthesizer':
      return event.merged
        ? chalk.hex('#9B59B6')(`Synthesizer: merged ${event.sources.join(', ')} → ${shortPath(event.target)}`)
        : chalk.dim(`Synthesizer: flagged ${event.sources.join(', ')} ~ ${shortPath(event.target)}`);
    case 'flash_overlap':
      return chalk.hex('#FFA500')(`Overlap: ${shortPath(event.target_path)} ~ ${shortPath(event.overlap_path)} (${event.reason})`);
    default:
      return '';
  }
}

function getMaintenanceEventsInRange(events: TelemetryEvent[], startPulse: number, endPulse: number): TelemetryEvent[] {
  const maintenanceTypes = new Set(['scout', 'grazer', 'verifier_stability', 'verifier_coverage', 'propagation', 'resolver', 'synthesizer', 'flash_overlap']);
  return events.filter(e =>
    maintenanceTypes.has(e.type) &&
    e.pulse >= startPulse &&
    e.pulse <= endPulse,
  );
}

// --- Node History View ---

function renderNodeHistory(events: TelemetryEvent[], nodePath: string): void {
  // Find events mentioning this node
  const matching = events.filter(e => eventMentionsNode(e, nodePath));

  if (matching.length === 0) {
    // Try partial match
    const allNodes = new Set<string>();
    for (const e of events) {
      for (const n of getNodesFromEvent(e)) {
        allNodes.add(n);
      }
    }
    const partialMatches = [...allNodes].filter(n => n.includes(nodePath));
    if (partialMatches.length > 0) {
      console.log(chalk.yellow(`No exact match for "${nodePath}". Did you mean:`));
      for (const m of partialMatches.slice(0, 10)) {
        console.log(`  ${chalk.dim('•')} ${m}`);
      }
      return;
    }
    console.log(chalk.red(`No events found for node "${nodePath}"`));
    return;
  }

  console.log(chalk.bold(`Node: ${nodePath}`));
  console.log('');

  for (const event of matching) {
    const pulseLabel = `Pulse ${String(event.pulse).padStart(3)}:`;

    if (event.type === 'pulse' && event.target === nodePath) {
      const actionStr = event.action || 'unknown';
      console.log(`  ${chalk.dim(pulseLabel)} ${chalk.cyan(actionStr)} by ${event.agent}`);
      if (event.reasoning) {
        console.log(`             ${chalk.dim(event.reasoning)}`);
      }
      console.log(`             signals after: need:${event.stats.avg_need} conf:${event.stats.avg_confidence}`);
    } else {
      console.log(`  ${chalk.dim(pulseLabel)} ${formatMaintenanceEvent(event)}`);
    }
  }
}

function eventMentionsNode(event: TelemetryEvent, nodePath: string): boolean {
  return getNodesFromEvent(event).includes(nodePath);
}

function getNodesFromEvent(event: TelemetryEvent): string[] {
  switch (event.type) {
    case 'pulse': return [event.target];
    case 'verifier_stability': return [event.node];
    case 'verifier_coverage': return [event.node];
    case 'propagation': return [event.node];
    case 'resolver': return [event.node];
    case 'synthesizer': return [event.target, ...event.sources];
    case 'flash_overlap': return [event.target_path, event.overlap_path];
    default: return [];
  }
}

// --- Maintenance View ---

function renderMaintenanceView(events: TelemetryEvent[]): void {
  const maintenanceTypes = new Set(['scout', 'grazer', 'verifier_stability', 'verifier_coverage', 'propagation', 'resolver', 'synthesizer', 'flash_overlap']);
  const maintenanceEvents = events.filter(e => maintenanceTypes.has(e.type));

  if (maintenanceEvents.length === 0) {
    console.log(chalk.dim('No maintenance events recorded.'));
    return;
  }

  console.log(chalk.bold('Maintenance & Ecology Events'));
  console.log('');

  // Group by pulse interval
  const byPulse = new Map<number, TelemetryEvent[]>();
  for (const e of maintenanceEvents) {
    const key = e.pulse;
    if (!byPulse.has(key)) byPulse.set(key, []);
    byPulse.get(key)!.push(e);
  }

  for (const [pulse, group] of [...byPulse.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(chalk.dim(`── Pulse ${pulse} ──`));
    for (const event of group) {
      const formatted = formatMaintenanceEvent(event);
      if (formatted) {
        console.log(`  ${formatted}`);
      }
    }
    console.log('');
  }
}

// --- Pulse Detail View ---

function renderPulseDetail(events: TelemetryEvent[], pulseNum: number): void {
  const pulseEvents = events.filter(e => e.pulse === pulseNum);

  if (pulseEvents.length === 0) {
    console.log(chalk.red(`No events found for pulse ${pulseNum}`));
    return;
  }

  console.log(chalk.bold(`Pulse ${pulseNum} Detail`));
  console.log('');

  for (const event of pulseEvents) {
    if (event.type === 'pulse') {
      console.log(chalk.bold(`Agent: ${event.agent}`));
      console.log(`Target: ${event.target}`);
      console.log(`Action: ${event.action}`);
      console.log(`Phase: ${event.phase}`);
      if (event.reasoning) {
        console.log(`Reasoning: ${chalk.dim(event.reasoning)}`);
      }
      console.log(`Mutations: ${event.mutations_succeeded}/${event.mutations_attempted} succeeded`);
      if (event.skipped_overheated > 0) {
        console.log(`Overheated: ${chalk.yellow(String(event.skipped_overheated))} skipped`);
      }
      console.log(`Cost: ${formatCost(event.cost.input_tokens, event.cost.output_tokens)}`);
      console.log('');
      console.log(chalk.dim('Tree stats after:'));
      const s = event.stats;
      console.log(`  Nodes: ${s.total_nodes} | Avg conf: ${s.avg_confidence} | Stable: ${s.stable_count} | Conflict: ${s.nodes_in_conflict}`);
    } else if (event.type === 'phase_change') {
      console.log(chalk.bold(`Phase Change: ${event.from} → ${event.to}`));
    } else {
      const formatted = formatMaintenanceEvent(event);
      if (formatted) {
        console.log(`  ${formatted}`);
      }
    }
    console.log('');
  }
}

// --- Agent Filter View ---

function renderAgentFilter(events: TelemetryEvent[], agentName: string): void {
  const matching = events.filter(e => {
    if (e.type === 'pulse') return e.agent.toLowerCase().includes(agentName.toLowerCase());
    if (e.type === 'scout') return agentName.toLowerCase() === 'scout';
    if (e.type === 'grazer') return agentName.toLowerCase() === 'grazer';
    if (e.type === 'verifier_stability' || e.type === 'verifier_coverage') return agentName.toLowerCase() === 'verifier';
    if (e.type === 'resolver') return agentName.toLowerCase() === 'resolver';
    if (e.type === 'synthesizer') return agentName.toLowerCase() === 'synthesizer';
    if (e.type === 'flash_overlap') return agentName.toLowerCase() === 'overlap' || agentName.toLowerCase() === 'flash_overlap';
    return false;
  });

  if (matching.length === 0) {
    console.log(chalk.red(`No events found for agent "${agentName}"`));
    return;
  }

  console.log(chalk.bold(`Events for agent: ${agentName}`));
  console.log(chalk.dim(`${matching.length} events`));
  console.log('');

  for (const event of matching) {
    const pulseLabel = `Pulse ${String(event.pulse).padStart(3)}:`;
    if (event.type === 'pulse') {
      const actionLabel = formatAction(event);
      console.log(`  ${chalk.dim(pulseLabel)} → ${chalk.bold(shortPath(event.target))}  ${actionLabel}`);
    } else {
      console.log(`  ${chalk.dim(pulseLabel)} ${formatMaintenanceEvent(event)}`);
    }
  }
}

// --- Helpers ---

function shortPath(path: string): string {
  const parts = path.split('/');
  return parts.length > 2 ? `.../${parts.slice(-2).join('/')}` : path;
}

function estimatePulseCost(inputTokens: number, outputTokens: number): string {
  // Gemini Flash Lite pricing: $0.10/1M input, $0.40/1M output
  const cost = (inputTokens * 0.10 + outputTokens * 0.40) / 1_000_000;
  if (cost < 0.001) return '<0.001';
  return cost.toFixed(3);
}

function formatCost(inputTokens: number, outputTokens: number): string {
  const cost = (inputTokens * 0.10 + outputTokens * 0.40) / 1_000_000;
  return `$${cost.toFixed(2)}`;
}
