import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pulse, run } from '../src/simulation/pulse.js';
import { MockSpore } from '../src/agents/mock-spore.js';
import { writeNode } from '../src/tree/node.js';
import { scanTree, getTreeStats } from '../src/tree/scanner.js';
import type { StigNode, WorkspaceConfig } from '../src/types.js';
import { DEFAULT_CONFIG, DEFAULT_EVIDENCE } from '../src/types.js';

let tmpDir: string;
let stigRoot: string;

function makeNode(path: string, name: string, overrides?: Partial<StigNode>): StigNode {
  return {
    path,
    name,
    signals: {
      need: 5,
      confidence: 0,
      conflict: 0,
      workers_active: 0,
      last_pulse: '2025-01-01T00:00:00.000Z',
    },
    evidence: { acceptance_criteria: 0, examples: 0, risks: 0 },
    content: '',
    isScaffold: false,
    ...overrides,
  };
}

function setupWorkspace(): void {
  stigRoot = tmpDir;
  const workspacePath = join(stigRoot, 'workspace');
  mkdirSync(workspacePath, { recursive: true });
  writeFileSync(join(stigRoot, 'mutations.log'), '', 'utf-8');
  writeFileSync(join(stigRoot, 'config.json'), JSON.stringify(DEFAULT_CONFIG), 'utf-8');

  // Create a minimal tree: root + 2 scaffold nodes
  writeNode(workspacePath, '.', makeNode('.', 'root', {
    signals: { need: 10, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' },
  }));
  writeNode(workspacePath, 'testing', makeNode('testing', 'testing', {
    signals: { need: 7, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' },
    isScaffold: true,
  }));
  writeNode(workspacePath, 'deployment', makeNode('deployment', 'deployment', {
    signals: { need: 7, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' },
    isScaffold: true,
  }));
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'stig-test-'));
  setupWorkspace();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('pulse', () => {
  it('executes one pulse and returns result', async () => {
    const agent = new MockSpore();
    const result = await pulse(stigRoot, agent, 1);

    expect(result).not.toBeNull();
    expect(result!.pulse_number).toBe(1);
    expect(result!.agent).toBe('MockSpore');
    expect(result!.mutations_attempted).toBeGreaterThan(0);
    expect(result!.mutations_succeeded).toBeGreaterThan(0);
    expect(result!.errors).toHaveLength(0);
  });

  it('targets highest priority node', async () => {
    const agent = new MockSpore();
    const result = await pulse(stigRoot, agent, 1);

    // Root has need:10 (score 20) vs scaffolds need:7+boost (score 15), root wins
    expect(result!.target_name).toBe('root');
  });

  it('creates child nodes after multiple pulses', async () => {
    const agent = new MockSpore();
    // Root has children (scaffolds), so MockSpore reviews it first.
    // Scaffolds are leaves, so they get decomposed in subsequent pulses.
    await pulse(stigRoot, agent, 1); // reviews root
    await pulse(stigRoot, agent, 2); // decomposes a scaffold

    const nodes = scanTree(join(stigRoot, 'workspace'));
    // Root + testing + deployment + scaffold's children
    expect(nodes.length).toBeGreaterThanOrEqual(5);
  });

  it('returns null for empty workspace', async () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), 'stig-empty-'));
    mkdirSync(join(emptyRoot, 'workspace'), { recursive: true });
    writeFileSync(join(emptyRoot, 'mutations.log'), '', 'utf-8');

    const agent = new MockSpore();
    const result = await pulse(emptyRoot, agent, 1);

    expect(result).toBeNull();
    rmSync(emptyRoot, { recursive: true, force: true });
  });
});

describe('run', () => {
  it('converges to stability', async () => {
    const agent = new MockSpore();
    const result = await run(stigRoot, agent, DEFAULT_CONFIG);

    expect(result.terminated_reason).toBe('stable');
    expect(result.total_pulses).toBeGreaterThan(0);
    expect(result.total_pulses).toBeLessThan(DEFAULT_CONFIG.max_pulses);

    // All work nodes should be stable
    const stats = result.final_stats;
    // At minimum, the original nodes + children should be stable
    expect(stats.stable_count).toBeGreaterThan(0);
  });

  it('respects max_pulses circuit breaker', async () => {
    const config: WorkspaceConfig = { ...DEFAULT_CONFIG, max_pulses: 2 };
    const agent = new MockSpore();
    const result = await run(stigRoot, agent, config);

    expect(result.total_pulses).toBeLessThanOrEqual(2);
    // With only 2 pulses, the tree likely hasn't stabilized
    expect(['max_pulses', 'stable']).toContain(result.terminated_reason);
  });

  it('records all pulse results', async () => {
    const agent = new MockSpore();
    const result = await run(stigRoot, agent, DEFAULT_CONFIG);

    expect(result.pulses).toHaveLength(result.total_pulses);
    for (let i = 0; i < result.pulses.length; i++) {
      expect(result.pulses[i].pulse_number).toBe(i + 1);
    }
  });

  it('produces a tree where priority target is at rest', async () => {
    const agent = new MockSpore();
    const result = await run(stigRoot, agent, DEFAULT_CONFIG);

    if (result.terminated_reason === 'stable') {
      const nodes = scanTree(join(stigRoot, 'workspace'));
      // Check that every node with need > 0 meets stability threshold
      for (const node of nodes) {
        if (node.signals.need > 0) {
          expect(node.signals.need).toBeLessThanOrEqual(DEFAULT_CONFIG.stability_threshold.need_max);
          expect(node.signals.confidence).toBeGreaterThanOrEqual(DEFAULT_CONFIG.stability_threshold.confidence_min);
        }
      }
    }
  });

  it('handles larger tree with more scaffolds', async () => {
    const workspacePath = join(stigRoot, 'workspace');
    writeNode(workspacePath, 'error-handling', makeNode('error-handling', 'error-handling', {
      signals: { need: 7, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' },
      isScaffold: true,
    }));

    const agent = new MockSpore();
    // 3 scaffolds decompose deeper, need more pulses
    const config: WorkspaceConfig = { ...DEFAULT_CONFIG, max_pulses: 100 };
    const result = await run(stigRoot, agent, config);

    expect(result.terminated_reason).toBe('stable');
    expect(result.final_stats.total_nodes).toBeGreaterThan(3);
  });
});
