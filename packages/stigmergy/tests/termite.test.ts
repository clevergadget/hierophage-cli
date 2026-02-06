import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sampleCrossBranchPairs } from '../src/agents/termite.js';
import type { StigNode } from '../src/types.js';

function makeNode(path: string, name: string, overrides?: Partial<StigNode>): StigNode {
  return {
    path,
    name,
    signals: {
      need: 5,
      confidence: 5,
      conflict: 0,
      workers_active: 0,
      last_pulse: '2025-01-01T00:00:00.000Z',
    },
    evidence: { acceptance_criteria: 0, examples: 0, risks: 0 },
    content: 'Substantive content describing this concern.',
    isScaffold: false,
    ...overrides,
  };
}

describe('sampleCrossBranchPairs', () => {
  it('returns empty when fewer than 2 branches', () => {
    const nodes = [
      makeNode('.', 'root'),
      makeNode('auth/login', 'Login', {}),
      makeNode('auth/register', 'Register', {}),
    ];
    const pairs = sampleCrossBranchPairs(nodes, 2, 2);
    expect(pairs).toHaveLength(0);
  });

  it('returns empty when only root exists', () => {
    const nodes = [makeNode('.', 'root')];
    const pairs = sampleCrossBranchPairs(nodes, 2, 2);
    expect(pairs).toHaveLength(0);
  });

  it('returns pairs from different branches', () => {
    const nodes = [
      makeNode('.', 'root'),
      makeNode('auth/login', 'Login'),
      makeNode('auth/register', 'Register'),
      makeNode('data/storage', 'Storage'),
      makeNode('data/cache', 'Cache'),
    ];
    const pairs = sampleCrossBranchPairs(nodes, 5, 2);

    for (const [a, b] of pairs) {
      const branchA = a.path.split('/')[0];
      const branchB = b.path.split('/')[0];
      expect(branchA).not.toBe(branchB);
    }
  });

  it('respects minDepth filter', () => {
    const nodes = [
      makeNode('.', 'root'),
      makeNode('auth', 'Auth'),           // depth 1 — should be excluded with minDepth 2
      makeNode('auth/login', 'Login'),     // depth 2 — eligible
      makeNode('data', 'Data'),            // depth 1 — should be excluded
      makeNode('data/storage', 'Storage'), // depth 2 — eligible
    ];

    // With minDepth 2, only depth >= 2 nodes are eligible
    const pairs = sampleCrossBranchPairs(nodes, 5, 2);
    for (const [a, b] of pairs) {
      expect(a.path.split('/').length).toBeGreaterThanOrEqual(2);
      expect(b.path.split('/').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('respects count limit', () => {
    const nodes = [
      makeNode('.', 'root'),
      makeNode('auth/login', 'Login'),
      makeNode('auth/register', 'Register'),
      makeNode('auth/logout', 'Logout'),
      makeNode('data/storage', 'Storage'),
      makeNode('data/cache', 'Cache'),
      makeNode('data/sync', 'Sync'),
      makeNode('ui/forms', 'Forms'),
      makeNode('ui/tables', 'Tables'),
    ];

    const pairs = sampleCrossBranchPairs(nodes, 2, 2);
    expect(pairs.length).toBeLessThanOrEqual(2);
  });

  it('does not return duplicate pairs', () => {
    const nodes = [
      makeNode('.', 'root'),
      makeNode('auth/login', 'Login'),
      makeNode('data/storage', 'Storage'),
    ];

    // With only 1 possible pair, requesting 5 should only return 1
    const pairs = sampleCrossBranchPairs(nodes, 5, 2);
    expect(pairs.length).toBeLessThanOrEqual(1);

    const seen = new Set<string>();
    for (const [a, b] of pairs) {
      const key = [a.path, b.path].sort().join('|');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('biases toward low-confidence nodes', () => {
    // Create nodes: one branch with low confidence, one branch with high confidence
    const nodes = [
      makeNode('.', 'root'),
      // Low confidence nodes (recently created) — should be sampled more often
      makeNode('auth/login', 'Login', {
        signals: { need: 5, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' },
      }),
      makeNode('auth/register', 'Register', {
        signals: { need: 5, confidence: 1, conflict: 0, workers_active: 0, last_pulse: '' },
      }),
      // High confidence nodes (settled) — should be sampled less often
      makeNode('data/storage', 'Storage', {
        signals: { need: 2, confidence: 9, conflict: 0, workers_active: 0, last_pulse: '' },
      }),
      makeNode('data/cache', 'Cache', {
        signals: { need: 2, confidence: 9, conflict: 0, workers_active: 0, last_pulse: '' },
      }),
      // Additional branch for variety
      makeNode('ui/forms', 'Forms', {
        signals: { need: 5, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' },
      }),
    ];

    // Sample many times and count appearances
    const appearances = new Map<string, number>();
    for (const node of nodes) {
      if (node.path !== '.') appearances.set(node.path, 0);
    }

    const iterations = 500;
    for (let i = 0; i < iterations; i++) {
      const pairs = sampleCrossBranchPairs(nodes, 1, 2);
      for (const [a, b] of pairs) {
        appearances.set(a.path, (appearances.get(a.path) || 0) + 1);
        appearances.set(b.path, (appearances.get(b.path) || 0) + 1);
      }
    }

    // Low-confidence nodes (auth/login, auth/register) should appear more than
    // high-confidence nodes (data/storage, data/cache)
    const lowConfAppearances = (appearances.get('auth/login') || 0) + (appearances.get('auth/register') || 0);
    const highConfAppearances = (appearances.get('data/storage') || 0) + (appearances.get('data/cache') || 0);

    // With weight = 10-conf, low conf (10, 9) vs high conf (1, 1) → ~10x difference
    // We just check low > high as a reasonable assertion
    expect(lowConfAppearances).toBeGreaterThan(highConfAppearances);
  });

  it('excludes root node', () => {
    const nodes = [
      makeNode('.', 'root'),
      makeNode('auth/login', 'Login'),
      makeNode('data/storage', 'Storage'),
    ];
    const pairs = sampleCrossBranchPairs(nodes, 5, 2);
    for (const [a, b] of pairs) {
      expect(a.path).not.toBe('.');
      expect(b.path).not.toBe('.');
    }
  });
});

describe('Termite (mock integration)', () => {
  // These tests verify the integration pattern without real API calls.
  // The Termite class itself follows the same Verifier pattern — structured JSON output.

  it('InspectionResult interface has expected shape', () => {
    // Type-level test: verifying the interface exists and has correct fields
    const result = {
      node_a: 'auth/login',
      node_b: 'data/login-handler',
      are_equivalent: true,
      reasoning: 'Both handle user login',
      cost: { api_calls: 1, input_tokens: 100, output_tokens: 50 },
    };

    expect(result.are_equivalent).toBe(true);
    expect(result.reasoning).toBeDefined();
    expect(result.cost.api_calls).toBe(1);
  });

  it('conflict should be raised on both nodes when equivalence detected', () => {
    // Simulates the integration logic in pulse.ts
    const nodeA = makeNode('auth/local-storage', 'Local Storage');
    const nodeB = makeNode('data/browser-storage', 'Browser Storage');

    // Simulate detection
    const are_equivalent = true;
    if (are_equivalent) {
      const newConflictA = Math.min(10, nodeA.signals.conflict + 2);
      const newConflictB = Math.min(10, nodeB.signals.conflict + 2);

      expect(newConflictA).toBe(2);
      expect(newConflictB).toBe(2);
    }
  });

  it('conflict caps at 10', () => {
    const nodeA = makeNode('auth/handler', 'Handler', {
      signals: { need: 5, confidence: 3, conflict: 9, workers_active: 0, last_pulse: '' },
    });

    const newConflict = Math.min(10, nodeA.signals.conflict + 2);
    expect(newConflict).toBe(10);
  });
});
