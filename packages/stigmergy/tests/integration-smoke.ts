/**
 * Integration smoke test: verifies safety mechanisms work against the real Gemini API.
 * Run manually with: GEMINI_API_KEY=... npx tsx tests/integration-smoke.ts
 *
 * NOT part of the automated test suite (requires API key and costs money).
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FlashSpore } from '../src/agents/flash-spore.js';
import { MockSpore } from '../src/agents/mock-spore.js';
import { run } from '../src/simulation/pulse.js';
import { writeNode } from '../src/tree/node.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import type { StigNode, WorkspaceConfig } from '../src/types.js';

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

function setupWorkspace(): string {
  const stigRoot = mkdtempSync(join(tmpdir(), 'stig-smoke-'));
  const workspacePath = join(stigRoot, 'workspace');
  mkdirSync(workspacePath, { recursive: true });
  writeFileSync(join(stigRoot, 'mutations.log'), '', 'utf-8');

  writeNode(workspacePath, '.', makeNode('.', 'root', {
    signals: { need: 10, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' },
    content: 'Design a simple counter app.',
  }));
  writeNode(workspacePath, 'frontend', makeNode('frontend', 'frontend', {
    signals: { need: 7, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' },
    isScaffold: true,
  }));
  writeNode(workspacePath, 'backend', makeNode('backend', 'backend', {
    signals: { need: 7, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' },
    isScaffold: true,
  }));

  return stigRoot;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.log(`  FAIL: ${label}`);
    failed++;
  }
}

async function testBudgetCapApiCalls(): Promise<void> {
  console.log('\n--- Test: Budget cap (API calls) ---');
  const stigRoot = setupWorkspace();

  try {
    const agent = new FlashSpore();
    const config: WorkspaceConfig = {
      ...DEFAULT_CONFIG,
      max_pulses: 50,
      budget: { max_api_calls: 2, max_input_tokens: 500_000, node_temperature_limit: 10 },
    };

    const result = await run(stigRoot, agent, config);

    assert(result.terminated_reason === 'budget_exceeded', `terminated_reason should be budget_exceeded, got: ${result.terminated_reason}`);
    assert(result.termination_detail?.includes('API call limit') ?? false, `detail should mention API call limit, got: ${result.termination_detail}`);
    assert(result.total_pulses <= 3, `should stop after ~2 pulses, got: ${result.total_pulses}`);
    assert(result.budget.total_api_calls >= 2, `should have at least 2 API calls, got: ${result.budget.total_api_calls}`);
    assert(result.budget.total_input_tokens > 0, `should have tracked input tokens, got: ${result.budget.total_input_tokens}`);
    assert(result.budget.total_output_tokens > 0, `should have tracked output tokens, got: ${result.budget.total_output_tokens}`);
  } finally {
    rmSync(stigRoot, { recursive: true, force: true });
  }
}

async function testBudgetCapInputTokens(): Promise<void> {
  console.log('\n--- Test: Budget cap (input tokens) ---');
  const stigRoot = setupWorkspace();

  try {
    const agent = new FlashSpore();
    // Set a very low input token cap — should trigger after 1-2 pulses
    const config: WorkspaceConfig = {
      ...DEFAULT_CONFIG,
      max_pulses: 50,
      budget: { max_api_calls: 1000, max_input_tokens: 600, node_temperature_limit: 10 },
    };

    const result = await run(stigRoot, agent, config);

    assert(result.terminated_reason === 'budget_exceeded', `terminated_reason should be budget_exceeded, got: ${result.terminated_reason}`);
    assert(result.termination_detail?.includes('Input token limit') ?? false, `detail should mention input tokens, got: ${result.termination_detail}`);
    assert(result.budget.total_input_tokens >= 600, `should have exceeded 600 input tokens, got: ${result.budget.total_input_tokens}`);
  } finally {
    rmSync(stigRoot, { recursive: true, force: true });
  }
}

async function testNodeTemperature(): Promise<void> {
  console.log('\n--- Test: Node temperature / overheating ---');
  const stigRoot = setupWorkspace();

  try {
    const agent = new FlashSpore();
    // Very low temperature limit: nodes overheat after 1 mutation
    const config: WorkspaceConfig = {
      ...DEFAULT_CONFIG,
      max_pulses: 5,
      budget: { max_api_calls: 20, max_input_tokens: 500_000, node_temperature_limit: 1 },
    };

    const result = await run(stigRoot, agent, config);

    // With temp limit 1, after the first pulse mutates a node,
    // subsequent attempts to mutate the same node should be skipped
    const totalSkipped = result.pulses.reduce((sum, p) => sum + p.skipped_overheated, 0);
    // We can't guarantee exact counts, but with such a low limit some should be skipped
    console.log(`  Info: ${totalSkipped} total skipped overheated mutations across ${result.total_pulses} pulses`);
    assert(result.budget.total_api_calls > 0, `should have made real API calls, got: ${result.budget.total_api_calls}`);
    // The run should complete (either stable, max_pulses, or budget)
    assert(['stable', 'max_pulses', 'budget_exceeded', 'no_target'].includes(result.terminated_reason),
      `should terminate cleanly, got: ${result.terminated_reason}`);
  } finally {
    rmSync(stigRoot, { recursive: true, force: true });
  }
}

async function testMissingApiKey(): Promise<void> {
  console.log('\n--- Test: Missing API key ---');
  try {
    const original = process.env['GEMINI_API_KEY'];
    delete process.env['GEMINI_API_KEY'];

    let threw = false;
    try {
      new FlashSpore('gemini-2.5-flash', undefined);
    } catch (e) {
      threw = true;
      assert(e instanceof Error && e.message.includes('GEMINI_API_KEY'), `error message should mention GEMINI_API_KEY`);
    }
    assert(threw, 'should throw without API key');

    // Restore
    if (original) process.env['GEMINI_API_KEY'] = original;
  } catch {
    // restore env just in case
  }
}

async function testCostTracking(): Promise<void> {
  console.log('\n--- Test: Cost tracking accuracy ---');
  const stigRoot = setupWorkspace();

  try {
    const agent = new FlashSpore();
    const config: WorkspaceConfig = {
      ...DEFAULT_CONFIG,
      max_pulses: 1,
      budget: { max_api_calls: 10, max_input_tokens: 500_000, node_temperature_limit: 10 },
    };

    const result = await run(stigRoot, agent, config);

    assert(result.budget.entries.length === 1, `should have 1 budget entry, got: ${result.budget.entries.length}`);
    const entry = result.budget.entries[0];
    assert(entry.api_calls === 1, `entry should show 1 API call, got: ${entry.api_calls}`);
    assert(entry.input_tokens > 0, `entry should have input tokens, got: ${entry.input_tokens}`);
    assert(entry.output_tokens > 0, `entry should have output tokens, got: ${entry.output_tokens}`);
    assert(entry.agent === 'FlashSpore', `entry agent should be FlashSpore, got: ${entry.agent}`);
    console.log(`  Info: 1 pulse cost ${entry.input_tokens} input + ${entry.output_tokens} output tokens`);
  } finally {
    rmSync(stigRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    console.error('GEMINI_API_KEY required. Run: GEMINI_API_KEY=... npx tsx tests/integration-smoke.ts');
    process.exit(1);
  }

  console.log('=== Stigmergy Integration Smoke Test ===');
  console.log('Testing safety mechanisms against real Gemini API.\n');

  await testMissingApiKey();
  await testCostTracking();
  await testBudgetCapApiCalls();
  await testBudgetCapInputTokens();
  await testNodeTemperature();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
