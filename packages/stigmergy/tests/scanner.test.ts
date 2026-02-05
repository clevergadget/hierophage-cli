import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeNode } from '../src/tree/node.js';
import { scanTree, findHighestPriority, getTreeStats, getColonyPhase, buildPhaseGuidance, selectNHighestPriority } from '../src/tree/scanner.js';
import type { StigNode } from '../src/types.js';

let tmpDir: string;

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

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'stig-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('scanTree', () => {
  it('returns empty array for empty workspace', () => {
    const nodes = scanTree(tmpDir);
    expect(nodes).toHaveLength(0);
  });

  it('finds root and child nodes', () => {
    writeNode(tmpDir, '.', makeNode('.', 'root'));
    writeNode(tmpDir, 'alpha', makeNode('alpha', 'alpha'));
    writeNode(tmpDir, 'beta', makeNode('beta', 'beta'));

    const nodes = scanTree(tmpDir);
    expect(nodes).toHaveLength(3);
    const names = nodes.map((n) => n.name).sort();
    expect(names).toEqual(['alpha', 'beta', 'root']);
  });

  it('finds nested nodes', () => {
    writeNode(tmpDir, '.', makeNode('.', 'root'));
    writeNode(tmpDir, 'parent', makeNode('parent', 'parent'));
    writeNode(tmpDir, 'parent/child', makeNode('parent/child', 'child'));

    const nodes = scanTree(tmpDir);
    expect(nodes).toHaveLength(3);
  });
});

describe('findHighestPriority', () => {
  it('returns null for empty array', () => {
    expect(findHighestPriority([])).toBeNull();
  });

  it('selects root when it is the only node with need', () => {
    const nodes = [makeNode('.', 'root')];
    const result = findHighestPriority(nodes);
    expect(result?.path).toBe('.');
  });

  it('returns null when all nodes have zero need', () => {
    const nodes = [
      makeNode('.', 'root', { signals: { need: 0, confidence: 9, conflict: 0, workers_active: 0, last_pulse: '' } }),
    ];
    expect(findHighestPriority(nodes)).toBeNull();
  });

  it('selects node with highest need', () => {
    const nodes = [
      makeNode('.', 'root'),
      makeNode('low', 'low', { signals: { need: 2, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' } }),
      makeNode('high', 'high', { signals: { need: 9, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' } }),
    ];
    const result = findHighestPriority(nodes);
    expect(result?.name).toBe('high');
  });

  it('prefers low confidence when need is equal', () => {
    const nodes = [
      makeNode('.', 'root', { signals: { need: 3, confidence: 9, conflict: 0, workers_active: 0, last_pulse: '' } }),
      makeNode('settled', 'settled', { signals: { need: 5, confidence: 8, conflict: 0, workers_active: 0, last_pulse: '' } }),
      makeNode('unsettled', 'unsettled', { signals: { need: 5, confidence: 1, conflict: 0, workers_active: 0, last_pulse: '' } }),
    ];
    const result = findHighestPriority(nodes);
    expect(result?.name).toBe('unsettled');
  });

  it('gives scaffold nodes a priority boost', () => {
    const nodes = [
      makeNode('.', 'root'),
      makeNode('regular', 'regular', { signals: { need: 5, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' } }),
      makeNode('scaffold', 'scaffold', { signals: { need: 5, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' }, isScaffold: true }),
    ];
    const result = findHighestPriority(nodes);
    expect(result?.name).toBe('scaffold');
  });
});

describe('getTreeStats', () => {
  it('returns zeros for empty array', () => {
    const stats = getTreeStats([]);
    expect(stats.total_nodes).toBe(0);
    expect(stats.avg_confidence).toBe(0);
  });

  it('computes correct aggregate stats', () => {
    const nodes = [
      makeNode('.', 'root', { signals: { need: 10, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' } }),
      makeNode('stable', 'stable', { signals: { need: 1, confidence: 9, conflict: 0, workers_active: 0, last_pulse: '' } }),
      makeNode('conflict', 'conflict', { signals: { need: 5, confidence: 3, conflict: 5, workers_active: 0, last_pulse: '' } }),
      makeNode('scaffold', 'scaffold', { isScaffold: true }),
    ];

    const stats = getTreeStats(nodes);
    expect(stats.total_nodes).toBe(4);
    expect(stats.nodes_in_conflict).toBe(1);
    expect(stats.stable_count).toBe(1);
    expect(stats.scaffold_count).toBe(1);
    expect(stats.avg_confidence).toBeGreaterThan(0);
  });
});

describe('getColonyPhase', () => {
  it('returns germination when avg confidence < 3', () => {
    const stats = { total_nodes: 10, avg_confidence: 2, avg_need: 5, nodes_in_conflict: 0, stable_count: 0, scaffold_count: 0 };
    expect(getColonyPhase(stats)).toBe('germination');
  });

  it('returns foraging when avg confidence 3-5', () => {
    const stats = { total_nodes: 10, avg_confidence: 4, avg_need: 5, nodes_in_conflict: 0, stable_count: 0, scaffold_count: 0 };
    expect(getColonyPhase(stats)).toBe('foraging');
  });

  it('returns brood-care when avg confidence 5-7', () => {
    const stats = { total_nodes: 10, avg_confidence: 6, avg_need: 3, nodes_in_conflict: 0, stable_count: 5, scaffold_count: 0 };
    expect(getColonyPhase(stats)).toBe('brood-care');
  });

  it('returns crystallization when avg confidence >= 7', () => {
    const stats = { total_nodes: 10, avg_confidence: 8, avg_need: 2, nodes_in_conflict: 0, stable_count: 8, scaffold_count: 0 };
    expect(getColonyPhase(stats)).toBe('crystallization');
  });
});

describe('buildPhaseGuidance', () => {
  it('includes colony state header', () => {
    const stats = { total_nodes: 5, avg_confidence: 2, avg_need: 7, nodes_in_conflict: 0, stable_count: 0, scaffold_count: 0 };
    const guidance = buildPhaseGuidance('germination', stats);
    expect(guidance).toContain('Colony State: GERMINATION');
    expect(guidance).toContain('DECOMPOSE');
  });

  it('recommends UPDATE_CONTENT for brood-care', () => {
    const stats = { total_nodes: 20, avg_confidence: 6, avg_need: 3, nodes_in_conflict: 0, stable_count: 10, scaffold_count: 0 };
    const guidance = buildPhaseGuidance('brood-care', stats);
    expect(guidance).toContain('UPDATE_CONTENT');
    expect(guidance).toContain('examples');
  });

  it('recommends SETTLE for crystallization', () => {
    const stats = { total_nodes: 20, avg_confidence: 8, avg_need: 2, nodes_in_conflict: 0, stable_count: 15, scaffold_count: 0 };
    const guidance = buildPhaseGuidance('crystallization', stats);
    expect(guidance).toContain('SETTLE');
  });
});

describe('selectNHighestPriority', () => {
  it('returns empty array for empty input', () => {
    expect(selectNHighestPriority([], 3)).toHaveLength(0);
  });

  it('returns single node when n=1', () => {
    const nodes = [
      makeNode('.', 'root'),
      makeNode('alpha', 'alpha', { signals: { need: 8, confidence: 2, conflict: 0, workers_active: 0, last_pulse: '' } }),
      makeNode('beta', 'beta', { signals: { need: 5, confidence: 2, conflict: 0, workers_active: 0, last_pulse: '' } }),
    ];
    const selected = selectNHighestPriority(nodes, 1);
    expect(selected).toHaveLength(1);
    expect(selected[0].name).toBe('alpha'); // Highest need
  });

  it('returns multiple nodes from different branches', () => {
    // Nodes in different branches (different parents) can all be selected
    const nodes = [
      makeNode('.', 'root'),
      makeNode('branch-a/child', 'child-a', { signals: { need: 9, confidence: 2, conflict: 0, workers_active: 0, last_pulse: '' } }),
      makeNode('branch-b/child', 'child-b', { signals: { need: 8, confidence: 2, conflict: 0, workers_active: 0, last_pulse: '' } }),
      makeNode('branch-c/child', 'child-c', { signals: { need: 7, confidence: 2, conflict: 0, workers_active: 0, last_pulse: '' } }),
    ];
    const selected = selectNHighestPriority(nodes, 3);
    expect(selected).toHaveLength(3);
    expect(selected[0].name).toBe('child-a'); // Highest priority
  });

  it('avoids selecting siblings (same parent)', () => {
    const nodes = [
      makeNode('.', 'root', { signals: { need: 0, confidence: 9, conflict: 0, workers_active: 0, last_pulse: '' } }), // Low priority
      makeNode('parent/child1', 'child1', { signals: { need: 9, confidence: 2, conflict: 0, workers_active: 0, last_pulse: '' } }),
      makeNode('parent/child2', 'child2', { signals: { need: 8, confidence: 2, conflict: 0, workers_active: 0, last_pulse: '' } }),
      makeNode('other-branch/node', 'other', { signals: { need: 7, confidence: 2, conflict: 0, workers_active: 0, last_pulse: '' } }),
    ];
    const selected = selectNHighestPriority(nodes, 2);
    expect(selected).toHaveLength(2);
    // Should get child1 (highest) and other (different parent), not child1 and child2
    const names = selected.map(n => n.name);
    expect(names).toContain('child1');
    expect(names).toContain('other');
    expect(names).not.toContain('child2'); // Sibling of child1, should be skipped
  });

  it('returns fewer than n if not enough non-sibling nodes', () => {
    const nodes = [
      makeNode('.', 'root'),
      makeNode('parent/a', 'a', { signals: { need: 9, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' } }),
      makeNode('parent/b', 'b', { signals: { need: 8, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' } }),
      makeNode('parent/c', 'c', { signals: { need: 7, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' } }),
    ];
    const selected = selectNHighestPriority(nodes, 3);
    // Only 2 unique parents (root, parent), so max 2 selected
    expect(selected.length).toBeLessThanOrEqual(2);
  });
});
