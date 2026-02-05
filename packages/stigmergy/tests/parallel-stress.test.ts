import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeNode } from '../src/tree/node.js';
import { scanTree } from '../src/tree/scanner.js';
import { batchPulse } from '../src/simulation/pulse.js';
import { MockSpore } from '../src/agents/mock-spore.js';
import { BudgetTracker } from '../src/budget/tracker.js';
import { DEFAULT_SIGNALS, DEFAULT_EVIDENCE, DEFAULT_BUDGET } from '../src/types.js';
import type { StigNode } from '../src/types.js';

function makeRoot(): StigNode {
  return {
    path: '.',
    name: 'root',
    signals: { ...DEFAULT_SIGNALS, need: 10, confidence: 0 },
    evidence: { ...DEFAULT_EVIDENCE },
    content: 'Stress test root',
    isScaffold: false,
  };
}

interface StressResult {
  parallelCount: number;
  pulses: number;
  nodes: number;
  elapsed: number;
  orphans: number;
  duplicates: number;
}

async function runStressTest(parallelCount: number, targetPulses: number): Promise<StressResult> {
  const stigRoot = mkdtempSync(join(tmpdir(), 'stig-stress-'));
  const workspacePath = join(stigRoot, 'workspace');
  mkdirSync(workspacePath, { recursive: true });
  writeFileSync(join(stigRoot, 'mutations.log'), '', 'utf-8');

  writeNode(workspacePath, '.', makeRoot());

  const agent = new MockSpore();
  const tracker = new BudgetTracker(stigRoot, DEFAULT_BUDGET);
  tracker.initLog();

  const start = Date.now();
  let totalPulses = 0;
  let batchNum = 1;

  while (totalPulses < targetPulses) {
    const results = await batchPulse(stigRoot, agent, batchNum, tracker, parallelCount);
    totalPulses += results.length;
    batchNum += results.length;
    if (results.length === 0) break;
  }

  const elapsed = Date.now() - start;
  const nodes = scanTree(workspacePath);

  // Check for orphans (nodes whose parent doesn't exist)
  const paths = new Set(nodes.map((n) => n.path));
  const orphans = nodes.filter((n) => {
    if (n.path === '.') return false;
    const parentPath = n.path.includes('/') ? n.path.split('/').slice(0, -1).join('/') || '.' : '.';
    return !paths.has(parentPath);
  });

  // Check for duplicates
  const seen = new Set<string>();
  const duplicates = nodes.filter((n) => {
    if (seen.has(n.path)) return true;
    seen.add(n.path);
    return false;
  });

  rmSync(stigRoot, { recursive: true, force: true });

  return {
    parallelCount,
    pulses: totalPulses,
    nodes: nodes.length,
    elapsed,
    orphans: orphans.length,
    duplicates: duplicates.length,
  };
}

describe('parallel stress tests', () => {
  it('parallel=1 maintains tree integrity', async () => {
    const r = await runStressTest(1, 50);
    expect(r.orphans).toBe(0);
    expect(r.duplicates).toBe(0);
    expect(r.nodes).toBeGreaterThan(1);
  });

  it('parallel=4 maintains tree integrity', async () => {
    const r = await runStressTest(4, 50);
    expect(r.orphans).toBe(0);
    expect(r.duplicates).toBe(0);
    expect(r.nodes).toBeGreaterThan(1);
  });

  it('parallel=8 maintains tree integrity', async () => {
    const r = await runStressTest(8, 50);
    expect(r.orphans).toBe(0);
    expect(r.duplicates).toBe(0);
    expect(r.nodes).toBeGreaterThan(1);
  });

  it('parallel=16 maintains tree integrity', async () => {
    const r = await runStressTest(16, 50);
    expect(r.orphans).toBe(0);
    expect(r.duplicates).toBe(0);
    expect(r.nodes).toBeGreaterThan(1);
  });

  it('parallel=32 maintains tree integrity', async () => {
    const r = await runStressTest(32, 50);
    expect(r.orphans).toBe(0);
    expect(r.duplicates).toBe(0);
    expect(r.nodes).toBeGreaterThan(1);
  });

  it('parallel=64 maintains tree integrity', async () => {
    const r = await runStressTest(64, 50);
    expect(r.orphans).toBe(0);
    expect(r.duplicates).toBe(0);
    expect(r.nodes).toBeGreaterThan(1);
  });
});

// Run with: npm test -- tests/parallel-stress.test.ts
