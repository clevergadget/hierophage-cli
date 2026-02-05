import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MutationDispatcher } from '../src/dispatch/dispatcher.js';
import { createMutation } from '../src/dispatch/mutations.js';
import { writeNode, readNode, nodeExists } from '../src/tree/node.js';
import type { StigNode } from '../src/types.js';

let tmpDir: string;
let stigRoot: string;
let dispatcher: MutationDispatcher;

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

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'stig-test-'));
  stigRoot = tmpDir;
  const workspacePath = join(stigRoot, 'workspace');
  mkdirSync(workspacePath, { recursive: true });

  // Write root node
  writeNode(workspacePath, '.', makeNode('.', 'root'));

  // Initialize mutations log
  const { writeFileSync } = require('node:fs');
  writeFileSync(join(stigRoot, 'mutations.log'), '', 'utf-8');

  dispatcher = new MutationDispatcher(stigRoot);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('CREATE_NODE', () => {
  it('creates a new node', () => {
    const mutation = createMutation('CREATE_NODE', 'platform', {
      name: 'platform',
      content: 'Platform decisions.',
    });

    const result = dispatcher.dispatch(mutation);
    expect(result.success).toBe(true);
    expect(nodeExists(join(stigRoot, 'workspace'), 'platform')).toBe(true);
  });

  it('rejects duplicate node', () => {
    const mutation = createMutation('CREATE_NODE', 'platform', { name: 'platform' });
    dispatcher.dispatch(mutation);

    const duplicate = createMutation('CREATE_NODE', 'platform', { name: 'platform' });
    const result = dispatcher.dispatch(duplicate);
    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
  });

  it('rejects node with missing parent', () => {
    const mutation = createMutation('CREATE_NODE', 'nonexistent/child', {
      name: 'child',
    });
    const result = dispatcher.dispatch(mutation);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Parent node does not exist');
  });

  it('creates nested node when parent exists', () => {
    dispatcher.dispatch(createMutation('CREATE_NODE', 'platform', { name: 'platform' }));

    const mutation = createMutation('CREATE_NODE', 'platform/target-os', {
      name: 'target-os',
    });
    const result = dispatcher.dispatch(mutation);
    expect(result.success).toBe(true);
  });

  it('rejects mutation without name', () => {
    const mutation = createMutation('CREATE_NODE', 'noname', {});
    const result = dispatcher.dispatch(mutation);
    expect(result.success).toBe(false);
    expect(result.error).toContain('name');
  });
});

describe('UPDATE_SIGNALS', () => {
  it('updates signals on existing node', () => {
    dispatcher.dispatch(createMutation('CREATE_NODE', 'test', { name: 'test' }));

    const mutation = createMutation('UPDATE_SIGNALS', 'test', {
      signals: { need: 8, confidence: 3, conflict: 0, workers_active: 0, last_pulse: '' },
    });
    const result = dispatcher.dispatch(mutation);
    expect(result.success).toBe(true);

    const node = readNode(join(stigRoot, 'workspace'), 'test');
    expect(node.signals.need).toBe(8);
    expect(node.signals.confidence).toBe(3);
  });

  it('rejects update on non-existent node', () => {
    const mutation = createMutation('UPDATE_SIGNALS', 'ghost', {
      signals: { need: 5, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' },
    });
    const result = dispatcher.dispatch(mutation);
    expect(result.success).toBe(false);
    expect(result.error).toContain('does not exist');
  });
});

describe('UPDATE_CONTENT', () => {
  it('updates content on existing node', () => {
    dispatcher.dispatch(createMutation('CREATE_NODE', 'test', { name: 'test', content: 'old' }));

    const mutation = createMutation('UPDATE_CONTENT', 'test', { content: 'new content' });
    const result = dispatcher.dispatch(mutation);
    expect(result.success).toBe(true);

    const node = readNode(join(stigRoot, 'workspace'), 'test');
    expect(node.content).toBe('new content');
  });
});

describe('DELETE_NODE', () => {
  it('deletes an existing node', () => {
    dispatcher.dispatch(createMutation('CREATE_NODE', 'doomed', { name: 'doomed' }));

    const mutation = createMutation('DELETE_NODE', 'doomed');
    const result = dispatcher.dispatch(mutation);
    expect(result.success).toBe(true);
    expect(nodeExists(join(stigRoot, 'workspace'), 'doomed')).toBe(false);
  });

  it('rejects deleting root', () => {
    const mutation = createMutation('DELETE_NODE', '.');
    const result = dispatcher.dispatch(mutation);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot delete root');
  });

  it('rejects deleting non-existent node', () => {
    const mutation = createMutation('DELETE_NODE', 'ghost');
    const result = dispatcher.dispatch(mutation);
    expect(result.success).toBe(false);
  });
});

describe('mutations.log', () => {
  it('appends entries for each mutation', () => {
    dispatcher.dispatch(createMutation('CREATE_NODE', 'a', { name: 'a' }));
    dispatcher.dispatch(createMutation('CREATE_NODE', 'b', { name: 'b' }));
    dispatcher.dispatch(createMutation('CREATE_NODE', 'a', { name: 'a' })); // duplicate = fail

    const log = readFileSync(join(stigRoot, 'mutations.log'), 'utf-8');
    const lines = log.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('OK');
    expect(lines[0]).toContain('CREATE_NODE');
    expect(lines[1]).toContain('OK');
    expect(lines[2]).toContain('ERR');
  });
});
