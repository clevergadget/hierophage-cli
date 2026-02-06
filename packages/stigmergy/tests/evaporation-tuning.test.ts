/**
 * Analytical tests for evaporation rate tuning and child-need dampening.
 *
 * These tests don't verify correctness (evaporation.test.ts does that).
 * They measure the *effect* of different parameter values on tree dynamics:
 * - How fast does average need drop under different decay rates?
 * - How many maintenance cycles to halve the "high need" population?
 * - What child dampening value minimizes aggregate need inflation?
 * - Is there a sweet spot where convergence improves without destabilizing?
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeNode, readNode } from '../src/tree/node.js';
import { MutationDispatcher } from '../src/dispatch/dispatcher.js';
import { evaporateSignals, type EvaporationRates } from '../src/simulation/pulse.js';
import { responseToMutations } from '../src/agents/flash-spore.js';
import { scanTree } from '../src/tree/scanner.js';
import { DEFAULT_SIGNALS, DEFAULT_EVIDENCE } from '../src/types.js';
import type { StigNode } from '../src/types.js';

function makeNode(path: string, name: string, need: number, confidence: number, conflict = 0): StigNode {
  return {
    path, name,
    signals: { ...DEFAULT_SIGNALS, need, confidence, conflict, last_pulse: new Date().toISOString() },
    evidence: { ...DEFAULT_EVIDENCE },
    content: `Content for ${name} — substantial enough to avoid Scout flags with acceptance criteria and examples.`,
    isScaffold: false,
  };
}

// -- Helpers for distribution analysis --

interface SignalSnapshot {
  avgNeed: number;
  avgConflict: number;
  avgConfidence: number;
  highNeedPct: number;     // % of nodes with need >= 5
  lowNeedPct: number;      // % of nodes with need <= 2
  conflictedPct: number;   // % of nodes with conflict > 0
}

function snapshot(workspacePath: string): SignalSnapshot {
  const nodes = scanTree(workspacePath);
  const n = nodes.length || 1;
  return {
    avgNeed: nodes.reduce((s, nd) => s + nd.signals.need, 0) / n,
    avgConflict: nodes.reduce((s, nd) => s + nd.signals.conflict, 0) / n,
    avgConfidence: nodes.reduce((s, nd) => s + nd.signals.confidence, 0) / n,
    highNeedPct: nodes.filter(nd => nd.signals.need >= 5).length / n * 100,
    lowNeedPct: nodes.filter(nd => nd.signals.need <= 2).length / n * 100,
    conflictedPct: nodes.filter(nd => nd.signals.conflict > 0).length / n * 100,
  };
}

/**
 * Build a tree that mimics a 30-pulse run:
 * - 40 nodes across 5 branches, depths 1-4
 * - Need distribution: mostly 5-8 (the "everything is priority" problem)
 * - Confidence: mix of 0-6
 * - Some conflict nodes
 */
function buildRealisticTree(workspacePath: string) {
  const branches = ['user-flows', 'architecture', 'api', 'data-model', 'error-handling'];
  writeNode(workspacePath, '.', makeNode('.', 'Build a task app', 8, 2));

  let idx = 0;
  for (const branch of branches) {
    writeNode(workspacePath, branch, makeNode(branch, branch, 7, 3));
    // 2-3 children per branch
    const childCount = 2 + (idx % 2);
    for (let c = 0; c < childCount; c++) {
      const childPath = `${branch}/child-${c}`;
      const need = 5 + (idx % 4);        // 5-8
      const conf = 1 + (idx % 5);        // 1-5
      const conflict = idx % 7 === 0 ? 3 : 0; // some conflict
      writeNode(workspacePath, childPath, makeNode(childPath, `child-${c}`, need, conf, conflict));

      // Some grandchildren
      if (c === 0) {
        const gcPath = `${childPath}/detail-${idx}`;
        writeNode(workspacePath, gcPath, makeNode(gcPath, `detail-${idx}`, 6 + (idx % 3), idx % 4, 0));
      }
      idx++;
    }
  }
}

describe('evaporation rate analysis', () => {
  let stigRoot: string;
  let workspacePath: string;

  beforeEach(() => {
    stigRoot = mkdtempSync(join(tmpdir(), 'stig-tune-'));
    workspacePath = join(stigRoot, 'workspace');
    mkdirSync(workspacePath, { recursive: true });
    writeFileSync(join(stigRoot, 'mutations.log'), '', 'utf-8');
  });

  afterEach(() => {
    rmSync(stigRoot, { recursive: true, force: true });
  });

  /**
   * Core experiment: run N maintenance cycles of evaporation with different rates
   * and compare how fast the need distribution improves.
   */
  it('compares decay rates over 10 maintenance cycles', () => {
    const rateConfigs: { label: string; rates: EvaporationRates }[] = [
      { label: 'none',          rates: { needDecay: 0,    conflictDecay: 0    } },
      { label: 'gentle (0.10)', rates: { needDecay: 0.10, conflictDecay: 0.03 } },
      { label: 'current (0.15)',rates: { needDecay: 0.15, conflictDecay: 0.05 } },
      { label: 'moderate (0.25)',rates: { needDecay: 0.25, conflictDecay: 0.08 } },
      { label: 'aggressive (0.40)',rates: { needDecay: 0.40, conflictDecay: 0.15 } },
    ];

    const results: Record<string, SignalSnapshot[]> = {};

    for (const { label, rates } of rateConfigs) {
      // Fresh tree for each config
      rmSync(stigRoot, { recursive: true, force: true });
      mkdirSync(workspacePath, { recursive: true });
      writeFileSync(join(stigRoot, 'mutations.log'), '', 'utf-8');
      buildRealisticTree(workspacePath);

      const snapshots: SignalSnapshot[] = [snapshot(workspacePath)];
      const noRecentTargets = new Set<string>();

      // Simulate 10 maintenance cycles (= 100 pulses worth of evaporation)
      for (let cycle = 0; cycle < 10; cycle++) {
        const nodes = scanTree(workspacePath);
        const dispatcher = new MutationDispatcher(stigRoot);
        evaporateSignals(nodes, dispatcher, noRecentTargets, (cycle + 1) * 10, undefined, rates);
        snapshots.push(snapshot(workspacePath));
      }

      results[label] = snapshots;
    }

    // Print comparison table
    console.log('\n=== EVAPORATION RATE COMPARISON (10 cycles, all nodes idle) ===\n');
    console.log('Metric: Average Need');
    console.log('Cycle |  none  | gentle | current | moderate | aggressive');
    console.log('------|--------|--------|---------|----------|----------');
    for (let i = 0; i <= 10; i++) {
      const row = rateConfigs.map(({ label }) =>
        results[label][i].avgNeed.toFixed(2).padStart(7)
      ).join(' |');
      console.log(`  ${String(i).padStart(2)}  |${row}`);
    }

    console.log('\nMetric: % Nodes with Need >= 5 (the "everything is priority" problem)');
    console.log('Cycle |  none  | gentle | current | moderate | aggressive');
    console.log('------|--------|--------|---------|----------|----------');
    for (let i = 0; i <= 10; i++) {
      const row = rateConfigs.map(({ label }) =>
        (results[label][i].highNeedPct.toFixed(0) + '%').padStart(7)
      ).join(' |');
      console.log(`  ${String(i).padStart(2)}  |${row}`);
    }

    console.log('\nMetric: % Nodes with Conflict > 0');
    console.log('Cycle |  none  | gentle | current | moderate | aggressive');
    console.log('------|--------|--------|---------|----------|----------');
    for (let i = 0; i <= 10; i++) {
      const row = rateConfigs.map(({ label }) =>
        (results[label][i].conflictedPct.toFixed(0) + '%').padStart(7)
      ).join(' |');
      console.log(`  ${String(i).padStart(2)}  |${row}`);
    }

    // Assertions: current rate should meaningfully reduce need without flooring everything
    const current = results['current (0.15)'];
    const none = results['none'];

    // After 10 cycles, current should have lower avg need than no evaporation
    expect(current[10].avgNeed).toBeLessThan(none[10].avgNeed);

    // Current should NOT floor everything to 1 after just 10 cycles
    // (that would mean the rate is too aggressive)
    expect(current[10].avgNeed).toBeGreaterThan(1.5);

    // High-need percentage should decrease meaningfully
    expect(current[10].highNeedPct).toBeLessThan(current[0].highNeedPct);
  });

  /**
   * How many cycles does it take for a need=7 node to reach the floor?
   * This tells us the "effective lifetime" of a high-priority signal.
   */
  it('measures cycles to floor for different starting needs', () => {
    const startNeeds = [3, 5, 7, 9];
    const rateOptions: { label: string; rate: number }[] = [
      { label: '0.10', rate: 0.10 },
      { label: '0.15', rate: 0.15 },
      { label: '0.25', rate: 0.25 },
      { label: '0.40', rate: 0.40 },
    ];

    console.log('\n=== CYCLES TO FLOOR (need → 1) ===\n');
    console.log('Start | rate=0.10 | rate=0.15 | rate=0.25 | rate=0.40');
    console.log('------|-----------|-----------|-----------|----------');

    for (const startNeed of startNeeds) {
      const cycleCounts: number[] = [];

      for (const { rate } of rateOptions) {
        // Analytical: how many cycles of -rate to go from startNeed to 1?
        // need - (cycles * rate) = 1  →  cycles = (need - 1) / rate
        const cycles = Math.ceil((startNeed - 1) / rate);
        cycleCounts.push(cycles);
      }

      const row = cycleCounts.map(c => String(c).padStart(9)).join(' |');
      console.log(` n=${startNeed}  |${row}`);
    }

    console.log('\nAt maintenance every 10 pulses, multiply by 10 for pulses.');
    console.log('E.g., need=7 @ rate=0.15: 40 cycles × 10 = 400 pulses to floor.\n');

    // Verify our current rate (0.15) for a need=7 node:
    // (7 - 1) / 0.15 = 40 cycles = 400 pulses.
    // That's 4x the default max_pulses (100). Very gentle.
    const cyclesToFloor = Math.ceil((7 - 1) / 0.15);
    expect(cyclesToFloor).toBe(40);
  });

  /**
   * In reality, not all nodes are idle. Test with a realistic mix:
   * - 10% of nodes get targeted each maintenance interval (are "recent")
   * - These nodes maintain their signals while idle ones decay
   */
  it('realistic scenario: 10% nodes active per cycle', () => {
    buildRealisticTree(workspacePath);

    const rates: EvaporationRates[] = [
      { needDecay: 0.15, conflictDecay: 0.05 },
      { needDecay: 0.25, conflictDecay: 0.08 },
      { needDecay: 0.35, conflictDecay: 0.12 },
    ];

    console.log('\n=== REALISTIC SCENARIO: 10% active nodes per cycle ===\n');

    for (const rate of rates) {
      // Fresh tree
      rmSync(stigRoot, { recursive: true, force: true });
      mkdirSync(workspacePath, { recursive: true });
      writeFileSync(join(stigRoot, 'mutations.log'), '', 'utf-8');
      buildRealisticTree(workspacePath);

      const initial = snapshot(workspacePath);
      const allNodes = scanTree(workspacePath);
      const nodePaths = allNodes.map(n => n.path);
      const activeCount = Math.max(1, Math.floor(nodePaths.length * 0.1));

      for (let cycle = 0; cycle < 10; cycle++) {
        const nodes = scanTree(workspacePath);
        const dispatcher = new MutationDispatcher(stigRoot);

        // Simulate 10% being active targets (rotate through deterministically)
        const activeStart = (cycle * activeCount) % nodePaths.length;
        const recentTargets = new Set<string>();
        for (let i = 0; i < activeCount; i++) {
          recentTargets.add(nodePaths[(activeStart + i) % nodePaths.length]);
        }

        evaporateSignals(nodes, dispatcher, recentTargets, (cycle + 1) * 10, undefined, rate);
      }

      const final = snapshot(workspacePath);
      console.log(`Rate: need=${rate.needDecay}, conflict=${rate.conflictDecay}`);
      console.log(`  Need:     ${initial.avgNeed.toFixed(2)} → ${final.avgNeed.toFixed(2)}  (Δ ${(final.avgNeed - initial.avgNeed).toFixed(2)})`);
      console.log(`  High(%):  ${initial.highNeedPct.toFixed(0)}% → ${final.highNeedPct.toFixed(0)}%`);
      console.log(`  Conflict: ${initial.conflictedPct.toFixed(0)}% → ${final.conflictedPct.toFixed(0)}%`);
      console.log('');
    }

    // The test passes if it runs — the data is for human analysis
    expect(true).toBe(true);
  });
});

describe('child-need dampening analysis', () => {
  /**
   * Measure aggregate need added by a DECOMPOSE action under different dampening values.
   * A parent at need=7 decomposes into 3 children. What's the total need delta?
   */
  it('compares aggregate need inflation across dampening values', () => {
    const parentNeeds = [5, 6, 7, 8, 9];
    const dampenings = [1, 2, 3]; // parent_need - N
    const childCount = 3; // typical DECOMPOSE produces 3 children
    const floor = 3;

    console.log('\n=== CHILD-NEED DAMPENING: Aggregate Need Added per DECOMPOSE ===\n');
    console.log('(Parent need → total child need added, assuming 3 children, floor=3)\n');
    console.log('Parent | damp=1 (old) | damp=2 (current) | damp=3');
    console.log('-------|--------------|------------------|-------');

    for (const parentNeed of parentNeeds) {
      const row = dampenings.map(d => {
        const childNeed = Math.max(floor, parentNeed - d);
        const totalAdded = childNeed * childCount;
        return String(totalAdded).padStart(d === 1 ? 12 : d === 2 ? 16 : 5);
      }).join(' |');
      console.log(` n=${parentNeed}   |${row}`);
    }

    console.log('\nThe parent also gets +2 confidence (not shown). Net need delta = total_child_need - parent_need_reduction.');
    console.log('');

    // Verify current behavior (dampening=2) through responseToMutations
    const parentNeeds2 = [5, 7, 9];
    console.log('Verified via responseToMutations (dampening=2):');
    for (const need of parentNeeds2) {
      const target = makeNode('.', 'root', need, 3);
      const response = {
        reasoning: 'test', action: 'DECOMPOSE',
        mutations: [
          { type: 'CREATE_NODE', path: 'a', name: 'A', content: 'test' },
          { type: 'CREATE_NODE', path: 'b', name: 'B', content: 'test' },
          { type: 'CREATE_NODE', path: 'c', name: 'C', content: 'test' },
        ],
      };
      const mutations = responseToMutations(response, target);
      const createMuts = mutations.filter(m => m.type === 'CREATE_NODE');
      const totalChildNeed = createMuts.reduce((s, m) => s + (m.payload.signals?.need ?? 0), 0);
      const childNeedValues = createMuts.map(m => m.payload.signals?.need);
      console.log(`  parent=${need}: children get need=${childNeedValues[0]} each, total=${totalChildNeed}`);
    }
    console.log('');

    // With dampening=2: parent=7 → children at 5 each → 15 total
    // With dampening=1: parent=7 → children at 6 each → 18 total
    // With dampening=3: parent=7 → children at 4 each → 12 total
    // Current (2) is a good middle ground.
    const target7 = makeNode('.', 'root', 7, 3);
    const response = {
      reasoning: 'test', action: 'DECOMPOSE',
      mutations: [{ type: 'CREATE_NODE', path: 'x', name: 'X', content: 'test' }],
    };
    const muts = responseToMutations(response, target7);
    const childNeed = muts.find(m => m.type === 'CREATE_NODE')!.payload.signals!.need!;
    expect(childNeed).toBe(5); // 7 - 2 = 5
  });

  /**
   * The interaction between child dampening and evaporation:
   * How quickly does evaporation bring decomposition-inflated need back down?
   */
  it('measures evaporation recovery time after DECOMPOSE burst', () => {
    buildRealisticTree(workspacePath);

    // Simulate a burst: add 10 new children at various need levels (as if 3-4 DECOMPOSEs happened)
    const burstChildren = [
      { path: 'burst/a', need: 5 }, { path: 'burst/b', need: 5 },
      { path: 'burst/c', need: 6 }, { path: 'burst/d', need: 5 },
      { path: 'burst/e', need: 7 }, { path: 'burst/f', need: 5 },
      { path: 'burst/g', need: 6 }, { path: 'burst/h', need: 5 },
      { path: 'burst/i', need: 5 }, { path: 'burst/j', need: 4 },
    ];

    writeNode(workspacePath, 'burst', makeNode('burst', 'burst-parent', 3, 6));
    for (const { path, need } of burstChildren) {
      writeNode(workspacePath, path, makeNode(path, path.split('/')[1], need, 0));
    }

    const initial = snapshot(workspacePath);

    const rateOptions = [
      { label: 'current (0.15)', rates: { needDecay: 0.15, conflictDecay: 0.05 } },
      { label: 'double (0.30)',  rates: { needDecay: 0.30, conflictDecay: 0.10 } },
    ];

    console.log('\n=== EVAPORATION RECOVERY AFTER DECOMPOSE BURST ===');
    console.log(`(Added ${burstChildren.length} children at need 4-7. Baseline avg need: ${initial.avgNeed.toFixed(2)})\n`);

    for (const { label, rates } of rateOptions) {
      // Reset to post-burst state
      rmSync(stigRoot, { recursive: true, force: true });
      mkdirSync(workspacePath, { recursive: true });
      writeFileSync(join(stigRoot, 'mutations.log'), '', 'utf-8');
      buildRealisticTree(workspacePath);
      writeNode(workspacePath, 'burst', makeNode('burst', 'burst-parent', 3, 6));
      for (const { path, need } of burstChildren) {
        writeNode(workspacePath, path, makeNode(path, path.split('/')[1], need, 0));
      }

      // Assume burst children are "active" for first 2 cycles, then idle
      console.log(`${label}:`);
      for (let cycle = 0; cycle < 8; cycle++) {
        const nodes = scanTree(workspacePath);
        const dispatcher = new MutationDispatcher(stigRoot);
        const recentTargets = new Set<string>();

        // First 2 cycles: burst children are being targeted (protected)
        if (cycle < 2) {
          for (const { path } of burstChildren) recentTargets.add(path);
        }

        evaporateSignals(nodes, dispatcher, recentTargets, (cycle + 1) * 10, undefined, rates);
        const s = snapshot(workspacePath);
        console.log(`  Cycle ${cycle + 1}: avg need=${s.avgNeed.toFixed(2)}, high_need=${s.highNeedPct.toFixed(0)}%`);
      }
      console.log('');
    }

    expect(true).toBe(true);
  });

  let stigRoot: string;
  let workspacePath: string;

  beforeEach(() => {
    stigRoot = mkdtempSync(join(tmpdir(), 'stig-damp-'));
    workspacePath = join(stigRoot, 'workspace');
    mkdirSync(workspacePath, { recursive: true });
    writeFileSync(join(stigRoot, 'mutations.log'), '', 'utf-8');
  });

  afterEach(() => {
    rmSync(stigRoot, { recursive: true, force: true });
  });
});
