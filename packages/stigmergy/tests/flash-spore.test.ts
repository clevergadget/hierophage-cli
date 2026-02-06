import { describe, it, expect, vi } from 'vitest';
import type { StigNode } from '../src/types.js';
import { responseToMutations, buildPrompt } from '../src/agents/flash-spore.js';

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

describe('FlashSpore', () => {
  it('has correct name and isRealAI', async () => {
    // We can't construct without API key, so test the class properties via a mock
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    const { FlashSpore } = await import('../src/agents/flash-spore.js');
    const spore = new FlashSpore('gemini-2.5-flash', 'test-key');
    expect(spore.name).toBe('FlashSpore');
    expect(spore.isRealAI).toBe(true);
    vi.unstubAllEnvs();
  });

  it('throws without API key', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    // Clear cached module to pick up fresh env
    const mod = await import('../src/agents/flash-spore.js');
    expect(() => new mod.FlashSpore('gemini-2.5-flash', undefined)).toThrow('GEMINI_API_KEY');
    vi.unstubAllEnvs();
  });
});

describe('responseToMutations', () => {
  it('parses decomposition response into CREATE_NODE mutations', () => {
    const target = makeNode('testing', 'testing', {
      signals: { need: 7, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' },
    });

    const response = {
      reasoning: 'This node needs to be broken down into sub-concerns.',
      action: 'DECOMPOSE',
      mutations: [
        {
          type: 'CREATE_NODE',
          path: 'testing/unit-tests',
          name: 'unit-tests',
          content: 'Unit test framework and coverage requirements.',
          signals: { need: 6, confidence: 0, conflict: 0 },
        },
        {
          type: 'CREATE_NODE',
          path: 'testing/integration-tests',
          name: 'integration-tests',
          content: 'End-to-end integration test strategy.',
          signals: { need: 5, confidence: 0, conflict: 0 },
        },
      ],
    };

    const mutations = responseToMutations(response, target);

    // 2 CREATE_NODE + 1 auto-appended confidence bump
    expect(mutations).toHaveLength(3);
    expect(mutations[0].type).toBe('CREATE_NODE');
    expect(mutations[0].path).toBe('testing/unit-tests');
    expect(mutations[0].payload.name).toBe('unit-tests');
    expect(mutations[0].payload.content).toBe('Unit test framework and coverage requirements.');
    expect(mutations[1].type).toBe('CREATE_NODE');
    expect(mutations[1].path).toBe('testing/integration-tests');
    // Auto confidence bump on parent
    expect(mutations[2].type).toBe('UPDATE_SIGNALS');
    expect(mutations[2].path).toBe('testing');
    expect(mutations[2].payload.signals?.confidence).toBe(2);
  });

  it('parses review response into UPDATE_SIGNALS mutations', () => {
    const target = makeNode('testing', 'testing', {
      signals: { need: 5, confidence: 3, conflict: 0, workers_active: 0, last_pulse: '' },
    });

    const response = {
      reasoning: 'The testing strategy looks solid after review.',
      action: 'REVIEW',
      mutations: [
        {
          type: 'UPDATE_SIGNALS',
          path: 'testing',
          signals: { confidence: 7, need: 2 },
        },
      ],
    };

    const mutations = responseToMutations(response, target);

    expect(mutations).toHaveLength(1);
    expect(mutations[0].type).toBe('UPDATE_SIGNALS');
    expect(mutations[0].payload.signals?.confidence).toBe(7);
    expect(mutations[0].payload.signals?.need).toBe(2);
  });

  it('returns empty mutations for empty response', () => {
    const target = makeNode('testing', 'testing');

    const response = {
      reasoning: 'Nothing to do.',
      action: 'SETTLE',
      mutations: [],
    };

    const mutations = responseToMutations(response, target);
    expect(mutations).toHaveLength(0);
  });

  it('clamps signal values to 0-10 range', () => {
    const target = makeNode('testing', 'testing');

    const response = {
      reasoning: 'Adjusting signals.',
      action: 'REVIEW',
      mutations: [
        {
          type: 'UPDATE_SIGNALS',
          path: 'testing',
          signals: { confidence: 15, need: -3, conflict: 100 },
        },
      ],
    };

    const mutations = responseToMutations(response, target);

    expect(mutations).toHaveLength(1);
    expect(mutations[0].payload.signals?.confidence).toBe(10);
    expect(mutations[0].payload.signals?.need).toBe(0);
    expect(mutations[0].payload.signals?.conflict).toBe(10);
  });

  it('rejects DELETE_NODE mutations', () => {
    const target = makeNode('testing', 'testing');

    const response = {
      reasoning: 'Trying to delete.',
      action: 'REVIEW',
      mutations: [
        {
          type: 'DELETE_NODE',
          path: 'testing',
        },
      ],
    };

    const mutations = responseToMutations(response, target);
    expect(mutations).toHaveLength(0);
  });

  it('sanitizes CREATE_NODE paths to be under target', () => {
    const target = makeNode('testing', 'testing');

    const response = {
      reasoning: 'Decomposing.',
      action: 'DECOMPOSE',
      mutations: [
        {
          type: 'CREATE_NODE',
          path: 'deployment/sneaky', // Wrong parent
          name: 'sneaky',
        },
        {
          type: 'CREATE_NODE',
          path: 'testing/valid-child',
          name: 'valid-child',
        },
        {
          type: 'CREATE_NODE',
          path: 'testing/deep/nested', // Too deep
          name: 'nested',
        },
      ],
    };

    const mutations = responseToMutations(response, target);

    // Only valid-child should pass + confidence bump
    const createNodes = mutations.filter((m) => m.type === 'CREATE_NODE');
    expect(createNodes).toHaveLength(1);
    expect(createNodes[0].path).toBe('testing/valid-child');
  });

  it('handles bare names as CREATE_NODE paths', () => {
    const target = makeNode('testing', 'testing');

    const response = {
      reasoning: 'Decomposing with bare names.',
      action: 'DECOMPOSE',
      mutations: [
        {
          type: 'CREATE_NODE',
          path: 'unit-tests', // bare name, should become testing/unit-tests
          name: 'unit-tests',
        },
      ],
    };

    const mutations = responseToMutations(response, target);
    const createNodes = mutations.filter((m) => m.type === 'CREATE_NODE');
    expect(createNodes).toHaveLength(1);
    expect(createNodes[0].path).toBe('testing/unit-tests');
  });

  it('handles root target decomposition', () => {
    const target = makeNode('.', 'root');

    const response = {
      reasoning: 'Decomposing root.',
      action: 'DECOMPOSE',
      mutations: [
        {
          type: 'CREATE_NODE',
          path: 'backend',
          name: 'backend',
        },
      ],
    };

    const mutations = responseToMutations(response, target);
    const createNodes = mutations.filter((m) => m.type === 'CREATE_NODE');
    expect(createNodes).toHaveLength(1);
    expect(createNodes[0].path).toBe('backend');
  });

  it('rejects echo paths where child slug matches parent slug', () => {
    const target = makeNode('deployment', 'deployment');

    const response = {
      reasoning: 'Decomposing.',
      action: 'DECOMPOSE',
      mutations: [
        {
          type: 'CREATE_NODE',
          path: 'deployment/deployment', // Echo: child slug = parent slug
          name: 'deployment',
        },
        {
          type: 'CREATE_NODE',
          path: 'deployment', // Bare echo name
          name: 'deployment',
        },
        {
          type: 'CREATE_NODE',
          path: 'deployment/ci-cd', // Valid
          name: 'ci-cd',
        },
      ],
    };

    const mutations = responseToMutations(response, target);
    const createNodes = mutations.filter((m) => m.type === 'CREATE_NODE');
    expect(createNodes).toHaveLength(1);
    expect(createNodes[0].path).toBe('deployment/ci-cd');
  });

  it('deduplicates CREATE_NODE mutations with same path', () => {
    const target = makeNode('testing', 'testing');

    const response = {
      reasoning: 'Decomposing with duplicates.',
      action: 'DECOMPOSE',
      mutations: [
        {
          type: 'CREATE_NODE',
          path: 'testing/unit-tests',
          name: 'unit-tests',
          content: 'First version.',
        },
        {
          type: 'CREATE_NODE',
          path: 'testing/unit-tests', // Duplicate
          name: 'unit-tests',
          content: 'Second version.',
        },
        {
          type: 'CREATE_NODE',
          path: 'testing/unit-tests', // Another duplicate
          name: 'unit-tests',
          content: 'Third version.',
        },
      ],
    };

    const mutations = responseToMutations(response, target);
    const createNodes = mutations.filter((m) => m.type === 'CREATE_NODE');
    expect(createNodes).toHaveLength(1);
    expect(createNodes[0].payload.content).toBe('First version.');
  });
});

describe('buildPrompt', () => {
  it('includes target info and context', () => {
    const target = makeNode('testing', 'testing', {
      content: 'Set up testing infrastructure.',
    });

    const prompt = buildPrompt(target, '--- ROOT: my-app ---\n', []);

    expect(prompt).toContain('## Context Chain');
    expect(prompt).toContain('## Target Node');
    expect(prompt).toContain('Path: testing');
    expect(prompt).toContain('Name: testing');
    expect(prompt).toContain('Set up testing infrastructure.');
    expect(prompt).toContain('leaf node');
  });

  it('includes children when present', () => {
    const target = makeNode('testing', 'testing');
    const children = [
      makeNode('testing/unit', 'unit', { content: 'Unit tests.' }),
    ];

    const prompt = buildPrompt(target, '', children);

    expect(prompt).toContain('## Existing Children');
    expect(prompt).toContain('**unit**');
    expect(prompt).not.toContain('leaf node');
  });

});
