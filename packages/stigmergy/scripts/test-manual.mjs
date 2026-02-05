#!/usr/bin/env node
/**
 * Manual integration test harness.
 *
 * This script sets up the proper environment for running quick manual tests
 * against the built package. It loads .env.local for API keys and provides
 * helper functions.
 *
 * Usage:
 *   node scripts/test-manual.mjs
 *
 * Or import helpers in your own test scripts:
 *   import { loadEnv, getAgent, testDecompose } from './scripts/test-manual.mjs';
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, '..');

// Load .env.local (overrides shell env)
export function loadEnv() {
  const envPath = join(packageRoot, '.env.local');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
      // Always use .env.local values - they take precedence over shell env
      process.env[key] = value;
    }
    console.log('✓ Loaded .env.local');
    return true;
  }
  console.log('⚠ No .env.local found - using existing environment');
  return false;
}

// Get FlashSpore agent
export async function getAgent() {
  const { FlashSpore } = await import(join(packageRoot, 'dist/src/agents/flash-spore.js'));
  return new FlashSpore();
}

// Get types
export async function getTypes() {
  return import(join(packageRoot, 'dist/src/types.js'));
}

// Create a test node
export async function makeTestNode(path = '.', name = 'root', content = '# Goal\n\nTest goal') {
  const { DEFAULT_SIGNALS, DEFAULT_EVIDENCE } = await getTypes();
  return {
    path,
    name,
    signals: { ...DEFAULT_SIGNALS, need: 10, confidence: 0 },
    evidence: { ...DEFAULT_EVIDENCE },
    content,
    isScaffold: false,
  };
}

// Test decomposition
export async function testDecompose(goal = 'Build a todo list app') {
  const agent = await getAgent();
  const node = await makeTestNode('.', 'root', `# Goal\n\n${goal}`);

  console.log(`\nTesting decomposition for: "${goal}"`);
  console.log('─'.repeat(50));

  const result = await agent.run(node, 'Root context', [], {
    phase: 'germination',
    stats: { total_nodes: 1, avg_confidence: 0, avg_need: 10, nodes_in_conflict: 0, stable_count: 0, scaffold_count: 0 },
    targetDepth: 0,
  });

  if (result.error) {
    console.log(`✗ Error: ${result.error}`);
    return result;
  }

  const createNodes = result.mutations.filter(m => m.type === 'CREATE_NODE');
  console.log(`✓ Created ${createNodes.length} child nodes:`);
  for (const m of createNodes) {
    console.log(`  • ${m.path}: ${m.payload.name}`);
  }
  console.log(`  Cost: ${result.cost.input_tokens} in / ${result.cost.output_tokens} out tokens`);

  return result;
}

// Create temp workspace for testing
export function createTempWorkspace(name = 'test') {
  const tempDir = join(packageRoot, '.temp', name);
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true });
  }
  mkdirSync(tempDir, { recursive: true });
  console.log(`✓ Created temp workspace: ${tempDir}`);
  return tempDir;
}

// Clean up temp workspaces
export function cleanupTempWorkspaces() {
  const tempDir = join(packageRoot, '.temp');
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true });
    console.log('✓ Cleaned up temp workspaces');
  }
}

// Run when executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Stigmergy Manual Test Harness');
  console.log('═'.repeat(50));

  loadEnv();

  if (!process.env.GEMINI_API_KEY) {
    console.log('\n✗ GEMINI_API_KEY not set. Create .env.local or set env var.');
    process.exit(1);
  }

  console.log('✓ GEMINI_API_KEY is set');

  // Run a quick decomposition test
  const result = await testDecompose();

  console.log('\n' + '═'.repeat(50));
  console.log(result.error ? 'Test failed' : 'Test passed');
}
