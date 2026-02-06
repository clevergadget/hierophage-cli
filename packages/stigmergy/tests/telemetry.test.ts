import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TelemetryEmitter, parseTelemetryLog } from '../src/simulation/telemetry.js';
import { run } from '../src/simulation/pulse.js';
import { MockSpore } from '../src/agents/mock-spore.js';
import { writeNode } from '../src/tree/node.js';
import type { StigNode, TelemetryEvent } from '../src/types.js';
import { DEFAULT_CONFIG } from '../src/types.js';

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
  tmpDir = mkdtempSync(join(tmpdir(), 'stig-telemetry-'));
  setupWorkspace();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('TelemetryEmitter', () => {
  it('creates telemetry.jsonl at init', () => {
    const emitter = new TelemetryEmitter(stigRoot);
    expect(existsSync(emitter.path)).toBe(true);
    expect(readFileSync(emitter.path, 'utf-8')).toBe('');
  });

  it('emits events as JSONL lines', () => {
    const emitter = new TelemetryEmitter(stigRoot);

    emitter.emit({
      type: 'run_start',
      timestamp: '2025-01-01T00:00:00.000Z',
      pulse: 0,
      goal: 'Test goal',
      model: 'test-model',
      max_pulses: 10,
      parallel: 1,
    });

    emitter.emit({
      type: 'run_end',
      timestamp: '2025-01-01T00:01:00.000Z',
      pulse: 5,
      reason: 'stable',
      stats: { total_nodes: 3, avg_confidence: 8, avg_need: 1, nodes_in_conflict: 0, stable_count: 3, scaffold_count: 0 },
      cost: { api_calls: 5, input_tokens: 1000, output_tokens: 500 },
    });

    const content = readFileSync(emitter.path, 'utf-8').trim();
    const lines = content.split('\n');
    expect(lines).toHaveLength(2);

    const event1 = JSON.parse(lines[0]);
    expect(event1.type).toBe('run_start');
    expect(event1.goal).toBe('Test goal');

    const event2 = JSON.parse(lines[1]);
    expect(event2.type).toBe('run_end');
    expect(event2.reason).toBe('stable');
  });

  it('clears file on each new emitter', () => {
    const emitter1 = new TelemetryEmitter(stigRoot);
    emitter1.emit({
      type: 'run_start',
      timestamp: '2025-01-01T00:00:00.000Z',
      pulse: 0,
      goal: 'First run',
      model: 'test',
      max_pulses: 10,
      parallel: 1,
    });

    // Second emitter should clear the file
    const emitter2 = new TelemetryEmitter(stigRoot);
    expect(readFileSync(emitter2.path, 'utf-8')).toBe('');
  });
});

describe('parseTelemetryLog', () => {
  it('parses JSONL file into event array', () => {
    const emitter = new TelemetryEmitter(stigRoot);

    emitter.emit({
      type: 'run_start',
      timestamp: '2025-01-01T00:00:00.000Z',
      pulse: 0,
      goal: 'Test',
      model: 'test',
      max_pulses: 10,
      parallel: 1,
    });

    emitter.emit({
      type: 'pulse',
      timestamp: '2025-01-01T00:00:01.000Z',
      pulse: 1,
      target: '.',
      agent: 'MockSpore',
      action: 'DECOMPOSE',
      reasoning: 'Test reasoning',
      mutations_attempted: 3,
      mutations_succeeded: 3,
      skipped_overheated: 0,
      cost: { api_calls: 0, input_tokens: 0, output_tokens: 0 },
      phase: 'germination',
      stats: { total_nodes: 5, avg_confidence: 1, avg_need: 6, nodes_in_conflict: 0, stable_count: 0, scaffold_count: 2 },
    });

    const events = parseTelemetryLog(emitter.path);
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('run_start');
    expect(events[1].type).toBe('pulse');
    if (events[1].type === 'pulse') {
      expect(events[1].action).toBe('DECOMPOSE');
      expect(events[1].reasoning).toBe('Test reasoning');
    }
  });

  it('returns empty array for missing file', () => {
    const events = parseTelemetryLog(join(stigRoot, 'nonexistent.jsonl'));
    expect(events).toEqual([]);
  });

  it('returns empty array for empty file', () => {
    writeFileSync(join(stigRoot, 'empty.jsonl'), '', 'utf-8');
    const events = parseTelemetryLog(join(stigRoot, 'empty.jsonl'));
    expect(events).toEqual([]);
  });
});

describe('run() telemetry integration', () => {
  it('writes telemetry.jsonl during run', async () => {
    const agent = new MockSpore();
    await run(stigRoot, agent, DEFAULT_CONFIG);

    const telemetryPath = join(stigRoot, 'telemetry.jsonl');
    expect(existsSync(telemetryPath)).toBe(true);

    const events = parseTelemetryLog(telemetryPath);
    expect(events.length).toBeGreaterThan(2); // At least run_start + some pulses + run_end
  });

  it('starts with run_start and ends with run_end', async () => {
    const agent = new MockSpore();
    await run(stigRoot, agent, DEFAULT_CONFIG);

    const events = parseTelemetryLog(join(stigRoot, 'telemetry.jsonl'));
    expect(events[0].type).toBe('run_start');
    expect(events[events.length - 1].type).toBe('run_end');
  });

  it('run_start contains goal and config', async () => {
    const agent = new MockSpore();
    await run(stigRoot, agent, DEFAULT_CONFIG);

    const events = parseTelemetryLog(join(stigRoot, 'telemetry.jsonl'));
    const start = events[0];
    expect(start.type).toBe('run_start');
    if (start.type === 'run_start') {
      expect(start.model).toBe(DEFAULT_CONFIG.model);
      expect(start.max_pulses).toBe(DEFAULT_CONFIG.max_pulses);
    }
  });

  it('run_end contains termination reason and stats', async () => {
    const agent = new MockSpore();
    await run(stigRoot, agent, DEFAULT_CONFIG);

    const events = parseTelemetryLog(join(stigRoot, 'telemetry.jsonl'));
    const end = events[events.length - 1];
    expect(end.type).toBe('run_end');
    if (end.type === 'run_end') {
      expect(['stable', 'max_pulses']).toContain(end.reason);
      expect(end.stats.total_nodes).toBeGreaterThan(0);
    }
  });

  it('emits pulse events with action and phase', async () => {
    const agent = new MockSpore();
    await run(stigRoot, agent, DEFAULT_CONFIG);

    const events = parseTelemetryLog(join(stigRoot, 'telemetry.jsonl'));
    const pulseEvents = events.filter(e => e.type === 'pulse');
    expect(pulseEvents.length).toBeGreaterThan(0);

    const firstPulse = pulseEvents[0];
    if (firstPulse.type === 'pulse') {
      expect(firstPulse.agent).toBe('MockSpore');
      expect(firstPulse.action).toBeDefined();
      expect(firstPulse.phase).toBeDefined();
      expect(firstPulse.target).toBeDefined();
    }
  });

  it('includes phase_change events when phase transitions', async () => {
    const agent = new MockSpore();
    await run(stigRoot, agent, DEFAULT_CONFIG);

    const events = parseTelemetryLog(join(stigRoot, 'telemetry.jsonl'));
    const phaseChanges = events.filter(e => e.type === 'phase_change');

    // MockSpore should drive the tree through at least one phase transition
    // (germination → foraging at minimum)
    expect(phaseChanges.length).toBeGreaterThan(0);

    if (phaseChanges[0].type === 'phase_change') {
      expect(phaseChanges[0].from).toBe('germination');
    }
  });

  it('includes scout events during maintenance cycles', async () => {
    // Need enough pulses to trigger maintenance (> 10)
    const config = { ...DEFAULT_CONFIG, max_pulses: 30 };
    const agent = new MockSpore();
    await run(stigRoot, agent, config);

    const events = parseTelemetryLog(join(stigRoot, 'telemetry.jsonl'));
    const scoutEvents = events.filter(e => e.type === 'scout');

    // Should have at least one scout patrol event
    expect(scoutEvents.length).toBeGreaterThan(0);

    if (scoutEvents[0].type === 'scout') {
      expect(scoutEvents[0].findings).toBeDefined();
      expect(scoutEvents[0].findings.hollow).toBeDefined();
      expect(scoutEvents[0].findings.tautologies).toBeDefined();
    }
  });

  it('pulse events have monotonically increasing pulse numbers', async () => {
    const agent = new MockSpore();
    await run(stigRoot, agent, DEFAULT_CONFIG);

    const events = parseTelemetryLog(join(stigRoot, 'telemetry.jsonl'));
    const pulseEvents = events.filter(e => e.type === 'pulse') as Extract<TelemetryEvent, { type: 'pulse' }>[];

    for (let i = 1; i < pulseEvents.length; i++) {
      expect(pulseEvents[i].pulse).toBeGreaterThanOrEqual(pulseEvents[i - 1].pulse);
    }
  });

  it('MockSpore includes action and reasoning', async () => {
    const agent = new MockSpore();
    await run(stigRoot, agent, { ...DEFAULT_CONFIG, max_pulses: 5 });

    const events = parseTelemetryLog(join(stigRoot, 'telemetry.jsonl'));
    const pulseEvents = events.filter(e => e.type === 'pulse') as Extract<TelemetryEvent, { type: 'pulse' }>[];

    for (const p of pulseEvents) {
      expect(p.action).toBeDefined();
      expect(['DECOMPOSE', 'REVIEW', 'SETTLE']).toContain(p.action);
      expect(p.reasoning).toBeDefined();
      expect(p.reasoning!.length).toBeGreaterThan(0);
    }
  });
});
