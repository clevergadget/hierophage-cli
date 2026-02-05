import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeNode } from '../src/tree/node.js';
import { buildContextChain, assembleContext, buildFullContext } from '../src/tree/context-chain.js';
import type { StigNode } from '../src/types.js';

let tmpDir: string;

function makeNode(path: string, name: string, content: string, overrides?: Partial<StigNode>): StigNode {
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
    content,
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

describe('buildContextChain', () => {
  it('returns only root for root path', () => {
    writeNode(tmpDir, '.', makeNode('.', 'root', 'Root content'));

    const chain = buildContextChain(tmpDir, '.');
    expect(chain).toHaveLength(1);
    expect(chain[0].name).toBe('root');
  });

  it('builds chain from root to nested node', () => {
    writeNode(tmpDir, '.', makeNode('.', 'root', 'Root content'));
    writeNode(tmpDir, 'platform', makeNode('platform', 'platform', 'Platform content'));
    writeNode(
      tmpDir,
      'platform/target-os',
      makeNode('platform/target-os', 'target-os', 'Target OS content'),
    );

    const chain = buildContextChain(tmpDir, 'platform/target-os');
    expect(chain).toHaveLength(3);
    expect(chain[0].name).toBe('root');
    expect(chain[1].name).toBe('platform');
    expect(chain[2].name).toBe('target-os');
  });

  it('builds chain for first-level child', () => {
    writeNode(tmpDir, '.', makeNode('.', 'root', 'Root'));
    writeNode(tmpDir, 'testing', makeNode('testing', 'testing', 'Testing'));

    const chain = buildContextChain(tmpDir, 'testing');
    expect(chain).toHaveLength(2);
    expect(chain[0].name).toBe('root');
    expect(chain[1].name).toBe('testing');
  });
});

describe('assembleContext', () => {
  it('formats chain with depth headers', () => {
    const chain: StigNode[] = [
      makeNode('.', 'root', 'Root content'),
      makeNode('child', 'child', 'Child content'),
    ];

    const result = assembleContext(chain);
    expect(result).toContain('--- ROOT: root');
    expect(result).toContain('Root content');
    expect(result).toContain('--- DEPTH 1: child');
    expect(result).toContain('Child content');
  });

  it('includes sibling summaries when provided', () => {
    const chain = [makeNode('.', 'root', 'Root')];
    const siblings = [
      makeNode('sib1', 'sibling-1', 'First line\nSecond line'),
      makeNode('sib2', 'sibling-2', 'Another first line'),
    ];

    const result = assembleContext(chain, siblings);
    expect(result).toContain('--- SIBLINGS ---');
    expect(result).toContain('sibling-1');
    expect(result).toContain('First line');
    expect(result).not.toContain('Second line');
  });
});

describe('buildFullContext', () => {
  it('returns chain and siblings', () => {
    writeNode(tmpDir, '.', makeNode('.', 'root', 'Root'));
    writeNode(tmpDir, 'alpha', makeNode('alpha', 'alpha', 'Alpha content'));
    writeNode(tmpDir, 'beta', makeNode('beta', 'beta', 'Beta content'));

    const { chain, siblings } = buildFullContext(tmpDir, 'alpha');
    expect(chain).toHaveLength(2);
    expect(chain[0].name).toBe('root');
    expect(chain[1].name).toBe('alpha');
    expect(siblings).toHaveLength(1);
    expect(siblings[0].name).toBe('beta');
  });
});
