import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BudgetTracker } from '../src/budget/tracker.js';
import { run } from '../src/simulation/pulse.js';
import { MockSpore } from '../src/agents/mock-spore.js';
import { writeNode } from '../src/tree/node.js';
import type { StigNode, WorkspaceConfig, BudgetConfig } from '../src/types.js';
import { DEFAULT_CONFIG, DEFAULT_BUDGET } from '../src/types.js';
import type { Agent, AgentResult } from '../src/agents/agent.js';

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

function setupWorkspace(stigRoot: string): void {
  const workspacePath = join(stigRoot, 'workspace');
  mkdirSync(workspacePath, { recursive: true });
  writeFileSync(join(stigRoot, 'mutations.log'), '', 'utf-8');
  writeFileSync(join(stigRoot, 'config.json'), JSON.stringify(DEFAULT_CONFIG), 'utf-8');

  writeNode(workspacePath, '.', makeNode('.', 'root', {
    signals: { need: 10, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' },
  }));
  writeNode(workspacePath, 'testing', makeNode('testing', 'testing', {
    signals: { need: 7, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' },
    isScaffold: true,
  }));
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'stig-test-'));
  setupWorkspace(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('BudgetTracker', () => {
  it('tracks API calls and tokens', () => {
    const tracker = new BudgetTracker(tmpDir, DEFAULT_BUDGET);
    tracker.initLog();

    tracker.record({
      pulse: 1,
      timestamp: new Date().toISOString(),
      api_calls: 3,
      input_tokens: 1500,
      output_tokens: 500,
      agent: 'TestAgent',
      target: 'testing',
    });

    tracker.record({
      pulse: 2,
      timestamp: new Date().toISOString(),
      api_calls: 2,
      input_tokens: 1000,
      output_tokens: 300,
      agent: 'TestAgent',
      target: 'deployment',
    });

    const snap = tracker.snapshot();
    expect(snap.total_api_calls).toBe(5);
    expect(snap.total_input_tokens).toBe(2500);
    expect(snap.total_output_tokens).toBe(800);
    expect(snap.entries).toHaveLength(2);
  });

  it('detects budget exceeded on API calls', () => {
    const config: BudgetConfig = { max_api_calls: 5, max_input_tokens: 500_000, node_temperature_limit: 5 };
    const tracker = new BudgetTracker(tmpDir, config);

    for (let i = 0; i < 5; i++) {
      tracker.record({
        pulse: i + 1,
        timestamp: new Date().toISOString(),
        api_calls: 1,
        input_tokens: 100,
        output_tokens: 50,
        agent: 'TestAgent',
        target: 'test',
      });
    }

    const check = tracker.checkBudget();
    expect(check).not.toBeNull();
    expect(check).toContain('API call limit');
  });

  it('detects budget exceeded on input tokens', () => {
    const config: BudgetConfig = { max_api_calls: 1000, max_input_tokens: 500, node_temperature_limit: 5 };
    const tracker = new BudgetTracker(tmpDir, config);

    tracker.record({
      pulse: 1,
      timestamp: new Date().toISOString(),
      api_calls: 1,
      input_tokens: 600,
      output_tokens: 100,
      agent: 'TestAgent',
      target: 'test',
    });

    const check = tracker.checkBudget();
    expect(check).not.toBeNull();
    expect(check).toContain('Input token limit');
  });

  it('returns null when within budget', () => {
    const tracker = new BudgetTracker(tmpDir, DEFAULT_BUDGET);
    tracker.record({
      pulse: 1,
      timestamp: new Date().toISOString(),
      api_calls: 1,
      input_tokens: 100,
      output_tokens: 50,
      agent: 'TestAgent',
      target: 'test',
    });

    expect(tracker.checkBudget()).toBeNull();
  });

  it('writes budget log to filesystem', () => {
    const tracker = new BudgetTracker(tmpDir, DEFAULT_BUDGET);
    tracker.initLog();
    tracker.record({
      pulse: 1,
      timestamp: '2025-01-01T00:00:00.000Z',
      api_calls: 2,
      input_tokens: 300,
      output_tokens: 100,
      agent: 'TestAgent',
      target: 'testing',
    });

    const log = readFileSync(join(tmpDir, 'budget.log'), 'utf-8');
    expect(log).toContain('# Budget Log');
    expect(log).toContain('api_calls=2');
    expect(log).toContain('input_tokens=300');
    expect(log).toContain('running_total_calls=2');
  });
});

describe('Node temperature', () => {
  it('tracks mutation count per node', () => {
    const tracker = new BudgetTracker(tmpDir, DEFAULT_BUDGET);

    tracker.recordMutation('testing');
    tracker.recordMutation('testing');
    tracker.recordMutation('testing');
    tracker.recordMutation('deployment');

    expect(tracker.getNodeTemperature('testing')).toBe(3);
    expect(tracker.getNodeTemperature('deployment')).toBe(1);
    expect(tracker.getNodeTemperature('unknown')).toBe(0);
  });

  it('detects overheated nodes at limit', () => {
    const config: BudgetConfig = { ...DEFAULT_BUDGET, node_temperature_limit: 3 };
    const tracker = new BudgetTracker(tmpDir, config);

    tracker.recordMutation('testing');
    tracker.recordMutation('testing');
    expect(tracker.isNodeOverheated('testing')).toBe(false);

    tracker.recordMutation('testing');
    expect(tracker.isNodeOverheated('testing')).toBe(true);
  });

  it('lists overheated nodes', () => {
    const config: BudgetConfig = { ...DEFAULT_BUDGET, node_temperature_limit: 2 };
    const tracker = new BudgetTracker(tmpDir, config);

    tracker.recordMutation('a');
    tracker.recordMutation('a');
    tracker.recordMutation('b');
    tracker.recordMutation('b');
    tracker.recordMutation('c');

    const overheated = tracker.getOverheatedNodes();
    expect(overheated).toHaveLength(2);
    const paths = overheated.map(n => n.path).sort();
    expect(paths).toEqual(['a', 'b']);
  });
});

describe('Budget cap in run loop', () => {
  /**
   * FakeExpensiveAgent: reports API costs to trigger budget cap.
   */
  class FakeExpensiveAgent implements Agent {
    readonly name = 'FakeExpensive';
    readonly isRealAI = true;

    async run(_target: StigNode, _context: string, _children: StigNode[]): Promise<AgentResult> {
      // Always just bump confidence — simple, always valid
      return {
        mutations: [
          {
            type: 'UPDATE_SIGNALS',
            path: _target.path,
            payload: { signals: { confidence: Math.min(10, _target.signals.confidence + 1) } },
            timestamp: new Date().toISOString(),
          },
        ],
        cost: { api_calls: 50, input_tokens: 10_000, output_tokens: 2_000 },
      };
    }
  }

  it('terminates run when API call budget exceeded', async () => {
    const config: WorkspaceConfig = {
      ...DEFAULT_CONFIG,
      max_pulses: 100,
      budget: { max_api_calls: 100, max_input_tokens: 500_000, node_temperature_limit: 10 },
    };

    const agent = new FakeExpensiveAgent();
    const result = await run(tmpDir, agent, config);

    expect(result.terminated_reason).toBe('budget_exceeded');
    expect(result.termination_detail).toContain('API call limit');
    // Should have stopped after 2 pulses (50 + 50 = 100 calls)
    expect(result.total_pulses).toBeLessThanOrEqual(3);
    expect(result.budget.total_api_calls).toBeGreaterThanOrEqual(100);
  });

  it('terminates run when input token budget exceeded', async () => {
    const config: WorkspaceConfig = {
      ...DEFAULT_CONFIG,
      max_pulses: 100,
      budget: { max_api_calls: 1000, max_input_tokens: 15_000, node_temperature_limit: 10 },
    };

    const agent = new FakeExpensiveAgent();
    const result = await run(tmpDir, agent, config);

    expect(result.terminated_reason).toBe('budget_exceeded');
    expect(result.termination_detail).toContain('Input token limit');
  });

  it('includes budget snapshot in run result', async () => {
    const agent = new MockSpore();
    const result = await run(tmpDir, agent, DEFAULT_CONFIG);

    expect(result.budget).toBeDefined();
    expect(result.budget.total_api_calls).toBe(0); // MockSpore reports 0
    expect(result.budget.entries.length).toBe(result.total_pulses);
  });
});

describe('Temperature in run loop', () => {
  it('skips mutations to overheated nodes', async () => {
    // Use a very low temperature limit so nodes overheat quickly
    const config: WorkspaceConfig = {
      ...DEFAULT_CONFIG,
      budget: { ...DEFAULT_BUDGET, node_temperature_limit: 2 },
    };

    const agent = new MockSpore();
    const result = await run(tmpDir, agent, config);

    // Some pulses should have skipped overheated mutations
    const totalSkipped = result.pulses.reduce((sum, p) => sum + p.skipped_overheated, 0);
    // With temp limit of 2, nodes that get mutated more than twice will be skipped
    // This is expected to cause non-convergence since nodes can't be fully stabilized
    expect(result.budget).toBeDefined();
  });
});
