import { describe, it, expect } from 'vitest';
import type { StigNode } from '../src/types.js';
import { buildBranchMap } from '../src/simulation/pulse.js';

function makeNode(path: string, name: string): StigNode {
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
  };
}

describe('buildBranchMap', () => {
  it('returns empty string for no nodes', () => {
    expect(buildBranchMap([])).toBe('');
  });

  it('returns empty string for root-only tree', () => {
    expect(buildBranchMap([makeNode('.', 'root')])).toBe('');
  });

  it('groups nodes by top-level branch', () => {
    const nodes = [
      makeNode('.', 'root'),
      makeNode('auth', 'Authentication'),
      makeNode('auth/login', 'Login'),
      makeNode('auth/register', 'Register'),
      makeNode('api', 'API Layer'),
      makeNode('api/endpoints', 'Endpoints'),
    ];

    const map = buildBranchMap(nodes);

    expect(map).toContain('auth/');
    expect(map).toContain('  Login (auth/login)');
    expect(map).toContain('  Register (auth/register)');
    expect(map).toContain('api/');
    expect(map).toContain('  Endpoints (api/endpoints)');
  });

  it('handles deep trees with increasing indentation', () => {
    const nodes = [
      makeNode('.', 'root'),
      makeNode('ui', 'User Interface'),
      makeNode('ui/components', 'Components'),
      makeNode('ui/components/button', 'Button'),
    ];

    const map = buildBranchMap(nodes);

    expect(map).toContain('ui/');
    expect(map).toContain('  Components (ui/components)');
    expect(map).toContain('    Button (ui/components/button)');
  });

  it('caps output at 200 lines for very large trees', () => {
    const nodes: StigNode[] = [makeNode('.', 'root')];
    // Create 50 branches with 5 children each = 300 lines
    for (let b = 0; b < 50; b++) {
      const branch = `branch-${b}`;
      nodes.push(makeNode(branch, `Branch ${b}`));
      for (let c = 0; c < 5; c++) {
        nodes.push(makeNode(`${branch}/child-${c}`, `Child ${c}`));
      }
    }

    const map = buildBranchMap(nodes);
    const lines = map.split('\n');

    // Should be capped near 200 lines (may slightly exceed due to branch header added before check)
    expect(lines.length).toBeLessThan(250);
    expect(map).toContain('... (truncated)');
  });

  it('sorts children by path within each branch', () => {
    const nodes = [
      makeNode('.', 'root'),
      makeNode('data', 'Data Layer'),
      makeNode('data/cache', 'Cache'),
      makeNode('data/api', 'API Client'),
    ];

    const map = buildBranchMap(nodes);
    const lines = map.split('\n');

    // api should come before cache alphabetically
    const apiLine = lines.findIndex(l => l.includes('API Client'));
    const cacheLine = lines.findIndex(l => l.includes('Cache'));
    expect(apiLine).toBeLessThan(cacheLine);
  });
});
