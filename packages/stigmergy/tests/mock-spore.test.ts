import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MockSpore } from '../src/agents/mock-spore.js';
import { writeNode, readNode, listChildren } from '../src/tree/node.js';
import { assembleContext, buildContextChain } from '../src/tree/context-chain.js';
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

describe('MockSpore', () => {
  const spore = new MockSpore();

  it('has correct name', () => {
    expect(spore.name).toBe('MockSpore');
  });

  it('decomposes a leaf node with low confidence', async () => {
    const target = makeNode('testing', 'testing', {
      signals: { need: 7, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' },
      isScaffold: true,
    });

    const { mutations } = await spore.run(target, '', []);

    // Should create 2 children + update parent
    expect(mutations).toHaveLength(3);
    expect(mutations[0].type).toBe('CREATE_NODE');
    expect(mutations[0].path).toBe('testing/unit-tests');
    expect(mutations[1].type).toBe('CREATE_NODE');
    expect(mutations[1].path).toBe('testing/integration-tests');
    expect(mutations[2].type).toBe('UPDATE_SIGNALS');
    expect(mutations[2].path).toBe('testing');
  });

  it('uses deterministic decomposition table', async () => {
    const target1 = makeNode('deployment', 'deployment');
    const { mutations: m1 } = await spore.run(target1, '', []);
    expect(m1[0].path).toBe('deployment/build-pipeline');
    expect(m1[1].path).toBe('deployment/hosting');

    const target2 = makeNode('error-handling', 'error-handling');
    const { mutations: m2 } = await spore.run(target2, '', []);
    expect(m2[0].path).toBe('error-handling/validation');
    expect(m2[1].path).toBe('error-handling/recovery');
  });

  it('falls back to design/impl for unknown names', async () => {
    const target = makeNode('networking', 'networking');
    const { mutations } = await spore.run(target, '', []);
    expect(mutations[0].path).toBe('networking/networking-design');
    expect(mutations[1].path).toBe('networking/networking-impl');
  });

  it('does not decompose at max depth', async () => {
    // depth 3 = three segments
    const target = makeNode('a/b/c', 'c', {
      signals: { need: 7, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' },
    });

    const { mutations } = await spore.run(target, '', []);

    // Should review, not decompose
    expect(mutations).toHaveLength(1);
    expect(mutations[0].type).toBe('UPDATE_SIGNALS');
  });

  it('settles a node with low need', async () => {
    const target = makeNode('settled', 'settled', {
      signals: { need: 3, confidence: 2, conflict: 0, workers_active: 0, last_pulse: '' },
    });

    const { mutations } = await spore.run(target, '', []);

    expect(mutations).toHaveLength(1);
    expect(mutations[0].type).toBe('UPDATE_SIGNALS');
    expect(mutations[0].payload.signals?.confidence).toBe(9);
    expect(mutations[0].payload.signals?.need).toBe(1);
  });

  it('settles a node with children and enough confidence', async () => {
    const target = makeNode('parent', 'parent', {
      signals: { need: 5, confidence: 3, conflict: 0, workers_active: 0, last_pulse: '' },
    });
    const children = [makeNode('parent/child', 'child')];

    const { mutations } = await spore.run(target, '', children);

    expect(mutations).toHaveLength(1);
    expect(mutations[0].payload.signals?.confidence).toBe(9);
    expect(mutations[0].payload.signals?.need).toBe(1);
  });

  it('reviews a node that has children but low confidence', async () => {
    const target = makeNode('parent', 'parent', {
      signals: { need: 7, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' },
    });
    const children = [makeNode('parent/child', 'child')];

    const { mutations } = await spore.run(target, '', children);

    // Should review: bump confidence, reduce need
    expect(mutations).toHaveLength(1);
    expect(mutations[0].type).toBe('UPDATE_SIGNALS');
    expect(mutations[0].payload.signals?.confidence).toBe(3);
    expect(mutations[0].payload.signals?.need).toBe(5);
  });

  it('is deterministic — same input produces same output', async () => {
    const target = makeNode('testing', 'testing');
    const { mutations: run1 } = await spore.run(target, '', []);
    const { mutations: run2 } = await spore.run(target, '', []);

    expect(run1.length).toBe(run2.length);
    for (let i = 0; i < run1.length; i++) {
      expect(run1[i].type).toBe(run2[i].type);
      expect(run1[i].path).toBe(run2[i].path);
    }
  });
});
