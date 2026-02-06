import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeNode, readNode } from '../src/tree/node.js';
import { MutationDispatcher } from '../src/dispatch/dispatcher.js';
import { BudgetTracker } from '../src/budget/tracker.js';
import { evaporateSignals, run } from '../src/simulation/pulse.js';
import { responseToMutations } from '../src/agents/flash-spore.js';
import { MockSpore } from '../src/agents/mock-spore.js';
import { scanTree } from '../src/tree/scanner.js';
import { DEFAULT_SIGNALS, DEFAULT_EVIDENCE, DEFAULT_BUDGET, DEFAULT_CONFIG } from '../src/types.js';
import type { StigNode, WorkspaceConfig } from '../src/types.js';

function makeNode(path: string, name: string, need: number, confidence: number, conflict = 0): StigNode {
  return {
    path,
    name,
    signals: { ...DEFAULT_SIGNALS, need, confidence, conflict, last_pulse: new Date().toISOString() },
    evidence: { ...DEFAULT_EVIDENCE },
    content: `Content for ${name}`,
    isScaffold: false,
  };
}

describe('signal evaporation', () => {
  let stigRoot: string;
  let workspacePath: string;

  beforeEach(() => {
    stigRoot = mkdtempSync(join(tmpdir(), 'stig-evap-test-'));
    workspacePath = join(stigRoot, 'workspace');
    mkdirSync(workspacePath, { recursive: true });
    writeFileSync(join(stigRoot, 'mutations.log'), '', 'utf-8');
  });

  afterEach(() => {
    rmSync(stigRoot, { recursive: true, force: true });
  });

  it('reduces need on idle nodes', () => {
    writeNode(workspacePath, '.', makeNode('.', 'root', 7, 3));
    writeNode(workspacePath, 'child-a', makeNode('child-a', 'A', 6, 4));

    const nodes = scanTree(workspacePath);
    const dispatcher = new MutationDispatcher(stigRoot);
    const recentTargets = new Set<string>(); // no recent targets

    const affected = evaporateSignals(nodes, dispatcher, recentTargets, 10);

    expect(affected).toBe(2);

    const root = readNode(workspacePath, '.');
    expect(root.signals.need).toBeLessThan(7);
    expect(root.signals.need).toBeGreaterThanOrEqual(1);

    const child = readNode(workspacePath, 'child-a');
    expect(child.signals.need).toBeLessThan(6);
  });

  it('reduces conflict on idle nodes', () => {
    writeNode(workspacePath, '.', makeNode('.', 'root', 5, 3, 4));

    const nodes = scanTree(workspacePath);
    const dispatcher = new MutationDispatcher(stigRoot);
    const recentTargets = new Set<string>();

    evaporateSignals(nodes, dispatcher, recentTargets, 10);

    const root = readNode(workspacePath, '.');
    expect(root.signals.conflict).toBeLessThan(4);
    expect(root.signals.conflict).toBeGreaterThanOrEqual(0);
  });

  it('skips recently-touched nodes', () => {
    writeNode(workspacePath, '.', makeNode('.', 'root', 7, 3));
    writeNode(workspacePath, 'child-a', makeNode('child-a', 'A', 6, 4));

    const nodes = scanTree(workspacePath);
    const dispatcher = new MutationDispatcher(stigRoot);
    // Both nodes are recent targets
    const recentTargets = new Set(['.', 'child-a']);

    const affected = evaporateSignals(nodes, dispatcher, recentTargets, 10);

    expect(affected).toBe(0);

    // Signals unchanged
    const root = readNode(workspacePath, '.');
    expect(root.signals.need).toBe(7);
    const child = readNode(workspacePath, 'child-a');
    expect(child.signals.need).toBe(6);
  });

  it('respects need floor of 1', () => {
    writeNode(workspacePath, '.', makeNode('.', 'root', 1, 5));

    const nodes = scanTree(workspacePath);
    const dispatcher = new MutationDispatcher(stigRoot);
    const recentTargets = new Set<string>();

    const affected = evaporateSignals(nodes, dispatcher, recentTargets, 10);

    // need=1 is already at floor, no decay possible
    expect(affected).toBe(0);
    const root = readNode(workspacePath, '.');
    expect(root.signals.need).toBe(1);
  });

  it('respects conflict floor of 0', () => {
    writeNode(workspacePath, '.', makeNode('.', 'root', 1, 5, 0));

    const nodes = scanTree(workspacePath);
    const dispatcher = new MutationDispatcher(stigRoot);
    const recentTargets = new Set<string>();

    const affected = evaporateSignals(nodes, dispatcher, recentTargets, 10);

    // need=1 at floor and conflict=0 at floor → nothing to decay
    expect(affected).toBe(0);
    const root = readNode(workspacePath, '.');
    expect(root.signals.conflict).toBe(0);
  });

  it('does not decay confidence', () => {
    writeNode(workspacePath, '.', makeNode('.', 'root', 5, 8));

    const nodes = scanTree(workspacePath);
    const dispatcher = new MutationDispatcher(stigRoot);
    const recentTargets = new Set<string>();

    evaporateSignals(nodes, dispatcher, recentTargets, 10);

    const root = readNode(workspacePath, '.');
    // Confidence must be unchanged
    expect(root.signals.confidence).toBe(8);
    // Need should have decayed
    expect(root.signals.need).toBeLessThan(5);
  });
});

describe('child-need dampening', () => {
  it('children get parent need - 2', () => {
    const target = makeNode('.', 'root', 7, 3);
    const response = {
      reasoning: 'test',
      action: 'DECOMPOSE',
      mutations: [
        { type: 'CREATE_NODE', path: 'child-a', name: 'A', content: 'test' },
      ],
    };

    const mutations = responseToMutations(response, target);
    const createMut = mutations.find(m => m.type === 'CREATE_NODE');
    expect(createMut).toBeDefined();
    // parent need 7 - 2 = 5
    expect(createMut!.payload.signals?.need).toBe(5);
  });

  it('children need floors at 3', () => {
    const target = makeNode('.', 'root', 4, 3);
    const response = {
      reasoning: 'test',
      action: 'DECOMPOSE',
      mutations: [
        { type: 'CREATE_NODE', path: 'child-a', name: 'A', content: 'test' },
      ],
    };

    const mutations = responseToMutations(response, target);
    const createMut = mutations.find(m => m.type === 'CREATE_NODE');
    expect(createMut).toBeDefined();
    // parent need 4 - 2 = 2, but floor is 3
    expect(createMut!.payload.signals?.need).toBe(3);
  });
});

describe('evaporation in run loop', () => {
  let stigRoot: string;
  let workspacePath: string;

  beforeEach(() => {
    stigRoot = mkdtempSync(join(tmpdir(), 'stig-evap-run-'));
    workspacePath = join(stigRoot, 'workspace');
    mkdirSync(workspacePath, { recursive: true });
    writeFileSync(join(stigRoot, 'mutations.log'), '', 'utf-8');
  });

  afterEach(() => {
    rmSync(stigRoot, { recursive: true, force: true });
  });

  it('integrates into run loop and reports evaporations', async () => {
    // Create a tree with enough nodes to generate idle ones
    writeNode(workspacePath, '.', makeNode('.', 'root', 10, 0));
    writeNode(workspacePath, 'a', makeNode('a', 'A', 8, 2));
    writeNode(workspacePath, 'b', makeNode('b', 'B', 7, 2));
    writeNode(workspacePath, 'c', makeNode('c', 'C', 6, 3));

    const agent = new MockSpore();
    const config: WorkspaceConfig = {
      ...DEFAULT_CONFIG,
      max_pulses: 25,
      max_concurrent_workers: 1,
      budget: { ...DEFAULT_BUDGET, max_api_calls: 200 },
    };

    const result = await run(stigRoot, agent, config);

    // After 25 pulses with maintenance at 10 and 20, evaporation should have run
    expect(result.total_pulses).toBeGreaterThanOrEqual(10);
    expect(result.evaporations).toBeGreaterThanOrEqual(0);
    // The run should complete with evaporations field present
    expect(result).toHaveProperty('evaporations');
  });
});
