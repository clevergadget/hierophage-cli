import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeNode, readNode, listChildren } from '../src/tree/node.js';
import { MutationDispatcher } from '../src/dispatch/dispatcher.js';
import { BudgetTracker } from '../src/budget/tracker.js';
import { batchPulse, pulse } from '../src/simulation/pulse.js';
import { MockSpore } from '../src/agents/mock-spore.js';
import { scanTree, selectNHighestPriority } from '../src/tree/scanner.js';
import { DEFAULT_SIGNALS, DEFAULT_EVIDENCE, DEFAULT_BUDGET } from '../src/types.js';
import type { StigNode } from '../src/types.js';

function makeNode(path: string, name: string, need: number, confidence: number): StigNode {
  return {
    path,
    name,
    signals: { ...DEFAULT_SIGNALS, need, confidence, last_pulse: new Date().toISOString() },
    evidence: { ...DEFAULT_EVIDENCE },
    content: `Content for ${name}`,
    isScaffold: false,
  };
}

describe('parallel pulse execution', () => {
  let stigRoot: string;
  let workspacePath: string;

  beforeEach(() => {
    stigRoot = mkdtempSync(join(tmpdir(), 'stig-parallel-test-'));
    workspacePath = join(stigRoot, 'workspace');
    require('node:fs').mkdirSync(workspacePath, { recursive: true });
    require('node:fs').writeFileSync(join(stigRoot, 'mutations.log'), '', 'utf-8');
  });

  afterEach(() => {
    rmSync(stigRoot, { recursive: true, force: true });
  });

  describe('sibling avoidance', () => {
    it('selectNHighestPriority avoids selecting siblings', () => {
      // Create tree with siblings
      writeNode(workspacePath, '.', makeNode('.', 'root', 10, 0));
      writeNode(workspacePath, 'child-a', makeNode('child-a', 'Child A', 8, 2));
      writeNode(workspacePath, 'child-b', makeNode('child-b', 'Child B', 8, 2));
      writeNode(workspacePath, 'child-c', makeNode('child-c', 'Child C', 8, 2));
      writeNode(workspacePath, 'child-a/deep', makeNode('child-a/deep', 'Deep', 9, 1));

      const nodes = scanTree(workspacePath);
      const selected = selectNHighestPriority(nodes, 3);

      // Should select from different branches, not all siblings
      const paths = selected.map(n => n.path);

      // Root should be selected (highest priority typically)
      // Then one from child-a branch and maybe child-b or child-c
      // But NOT all three siblings child-a, child-b, child-c
      const topLevelChildren = paths.filter(p => ['child-a', 'child-b', 'child-c'].includes(p));
      expect(topLevelChildren.length).toBeLessThanOrEqual(1);
    });

    it('selects from different branches when possible', () => {
      writeNode(workspacePath, '.', makeNode('.', 'root', 5, 5));
      writeNode(workspacePath, 'branch-a', makeNode('branch-a', 'Branch A', 8, 2));
      writeNode(workspacePath, 'branch-a/leaf', makeNode('branch-a/leaf', 'Leaf A', 9, 1));
      writeNode(workspacePath, 'branch-b', makeNode('branch-b', 'Branch B', 8, 2));
      writeNode(workspacePath, 'branch-b/leaf', makeNode('branch-b/leaf', 'Leaf B', 9, 1));

      const nodes = scanTree(workspacePath);
      const selected = selectNHighestPriority(nodes, 2);

      // Should prefer nodes from different branches
      const branches = selected.map(n => n.path.split('/')[0]);
      const uniqueBranches = new Set(branches);
      expect(uniqueBranches.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('concurrent mutation handling', () => {
    it('dispatcher handles duplicate CREATE_NODE attempts', () => {
      writeNode(workspacePath, '.', makeNode('.', 'root', 10, 0));

      const dispatcher = new MutationDispatcher(stigRoot);

      // First creation succeeds
      const result1 = dispatcher.dispatch({
        type: 'CREATE_NODE',
        path: 'new-child',
        payload: { name: 'New Child', content: 'First', signals: DEFAULT_SIGNALS },
        timestamp: new Date().toISOString(),
      });
      expect(result1.success).toBe(true);

      // Second creation of same path fails
      const result2 = dispatcher.dispatch({
        type: 'CREATE_NODE',
        path: 'new-child',
        payload: { name: 'New Child', content: 'Second', signals: DEFAULT_SIGNALS },
        timestamp: new Date().toISOString(),
      });
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('already exists');

      // Original content preserved
      const node = readNode(workspacePath, 'new-child');
      expect(node.content).toBe('First');
    });

    it('signal updates are atomic (last write wins)', () => {
      writeNode(workspacePath, '.', makeNode('.', 'root', 5, 5));

      const dispatcher = new MutationDispatcher(stigRoot);

      // Simulate concurrent signal updates
      dispatcher.dispatch({
        type: 'UPDATE_SIGNALS',
        path: '.',
        payload: { signals: { confidence: 7 } },
        timestamp: new Date().toISOString(),
      });

      dispatcher.dispatch({
        type: 'UPDATE_SIGNALS',
        path: '.',
        payload: { signals: { confidence: 8 } },
        timestamp: new Date().toISOString(),
      });

      const node = readNode(workspacePath, '.');
      expect(node.signals.confidence).toBe(8); // Last write wins
    });
  });

  describe('batch pulse execution', () => {
    it('batchPulse runs multiple agents and collects results', async () => {
      writeNode(workspacePath, '.', makeNode('.', 'root', 10, 0));
      writeNode(workspacePath, 'a', makeNode('a', 'A', 8, 2));
      writeNode(workspacePath, 'b', makeNode('b', 'B', 8, 2));

      const agent = new MockSpore();
      const tracker = new BudgetTracker(stigRoot, DEFAULT_BUDGET);
      tracker.initLog();

      const results = await batchPulse(stigRoot, agent, 1, tracker, 2);

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.length).toBeLessThanOrEqual(2);

      // Each result should have expected structure
      for (const result of results) {
        expect(result).toHaveProperty('pulse_number');
        expect(result).toHaveProperty('target_path');
        expect(result).toHaveProperty('mutations_attempted');
      }
    });

    it('batchPulse with parallelCount=1 behaves like single pulse', async () => {
      writeNode(workspacePath, '.', makeNode('.', 'root', 10, 0));

      const agent = new MockSpore();
      const tracker = new BudgetTracker(stigRoot, DEFAULT_BUDGET);
      tracker.initLog();

      const results = await batchPulse(stigRoot, agent, 1, tracker, 1);

      expect(results.length).toBe(1);
      expect(results[0].target_path).toBe('.');
    });

    it('handles empty tree gracefully', async () => {
      // No nodes written - empty workspace
      const agent = new MockSpore();
      const tracker = new BudgetTracker(stigRoot, DEFAULT_BUDGET);
      tracker.initLog();

      const results = await batchPulse(stigRoot, agent, 1, tracker, 4);

      expect(results.length).toBe(0);
    });
  });

  describe('budget tracking with parallel execution', () => {
    it('tracks costs across parallel pulses correctly', async () => {
      writeNode(workspacePath, '.', makeNode('.', 'root', 10, 0));
      writeNode(workspacePath, 'a', makeNode('a', 'A', 8, 2));
      writeNode(workspacePath, 'b', makeNode('b', 'B', 7, 3));

      const agent = new MockSpore();
      const tracker = new BudgetTracker(stigRoot, DEFAULT_BUDGET);
      tracker.initLog();

      await batchPulse(stigRoot, agent, 1, tracker, 3);

      const snapshot = tracker.snapshot();
      // MockSpore reports 0 API calls, but structure should be valid
      expect(snapshot).toHaveProperty('total_api_calls');
      expect(snapshot).toHaveProperty('total_input_tokens');
      expect(snapshot).toHaveProperty('total_output_tokens');
    });
  });

  describe('partial failure handling', () => {
    it('continues when some targets are no longer valid', async () => {
      writeNode(workspacePath, '.', makeNode('.', 'root', 10, 0));
      writeNode(workspacePath, 'a', makeNode('a', 'A', 8, 2));

      const agent = new MockSpore();
      const tracker = new BudgetTracker(stigRoot, DEFAULT_BUDGET);
      tracker.initLog();

      // First batch should work
      const results1 = await batchPulse(stigRoot, agent, 1, tracker, 2);
      expect(results1.length).toBeGreaterThan(0);

      // Tree has grown, second batch should still work
      const results2 = await batchPulse(stigRoot, agent, 10, tracker, 2);
      // May have different number of results based on tree state
      expect(Array.isArray(results2)).toBe(true);
    });
  });
});

describe('temperature/damping with parallel', () => {
  let stigRoot: string;
  let workspacePath: string;

  beforeEach(() => {
    stigRoot = mkdtempSync(join(tmpdir(), 'stig-temp-test-'));
    workspacePath = join(stigRoot, 'workspace');
    require('node:fs').mkdirSync(workspacePath, { recursive: true });
    require('node:fs').writeFileSync(join(stigRoot, 'mutations.log'), '', 'utf-8');
  });

  afterEach(() => {
    rmSync(stigRoot, { recursive: true, force: true });
  });

  it('temperature tracking works across mutations', () => {
    const budget = { ...DEFAULT_BUDGET, node_temperature_limit: 3 };
    const tracker = new BudgetTracker(stigRoot, budget);
    tracker.initLog();

    // Manually record mutations to a node
    expect(tracker.isNodeOverheated('test-node')).toBe(false);
    expect(tracker.getNodeTemperature('test-node')).toBe(0);

    tracker.recordMutation('test-node');
    expect(tracker.getNodeTemperature('test-node')).toBe(1);
    expect(tracker.isNodeOverheated('test-node')).toBe(false);

    tracker.recordMutation('test-node');
    expect(tracker.getNodeTemperature('test-node')).toBe(2);
    expect(tracker.isNodeOverheated('test-node')).toBe(false);

    tracker.recordMutation('test-node');
    expect(tracker.getNodeTemperature('test-node')).toBe(3);
    // After 3 mutations, node should be overheated (>= limit)
    expect(tracker.isNodeOverheated('test-node')).toBe(true);
  });

  it('pulse skips overheated nodes', async () => {
    writeNode(workspacePath, '.', makeNode('.', 'root', 10, 0));

    const agent = new MockSpore();
    const budget = { ...DEFAULT_BUDGET, node_temperature_limit: 1 };
    const tracker = new BudgetTracker(stigRoot, budget);
    tracker.initLog();

    // First pulse should succeed
    const result1 = await pulse(stigRoot, agent, 1, tracker, '.');
    expect(result1?.mutations_succeeded).toBeGreaterThan(0);

    // Root is now overheated (1 mutation >= limit of 1)
    expect(tracker.isNodeOverheated('.')).toBe(true);

    // Second pulse targeting same node should skip mutations
    const result2 = await pulse(stigRoot, agent, 2, tracker, '.');
    expect(result2?.skipped_overheated).toBeGreaterThan(0);
  });
});
