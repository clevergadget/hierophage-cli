import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseNodeContent,
  serializeNode,
  readNode,
  writeNode,
  listChildren,
  nodeExists,
} from '../src/tree/node.js';
import type { StigNode } from '../src/types.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'stig-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('parseNodeContent', () => {
  it('parses valid frontmatter + body', () => {
    const raw = `---
name: my-node
need: 7
confidence: 3
conflict: 1
workers_active: 0
last_pulse: "2025-01-01T00:00:00.000Z"
acceptance_criteria: 2
examples: 1
risks: 0
scaffold: true
---
This is the body content.`;

    const node = parseNodeContent(raw, 'some/path');
    expect(node.name).toBe('my-node');
    expect(node.signals.need).toBe(7);
    expect(node.signals.confidence).toBe(3);
    expect(node.signals.conflict).toBe(1);
    expect(node.evidence.acceptance_criteria).toBe(2);
    expect(node.evidence.examples).toBe(1);
    expect(node.content).toBe('This is the body content.');
    expect(node.isScaffold).toBe(true);
    expect(node.path).toBe('some/path');
  });

  it('handles missing frontmatter gracefully', () => {
    const raw = 'Just some plain markdown content.';
    const node = parseNodeContent(raw, 'test');
    expect(node.content).toBe('Just some plain markdown content.');
    expect(node.signals.need).toBe(5);
    expect(node.signals.confidence).toBe(0);
    expect(node.isScaffold).toBe(false);
  });

  it('uses defaults for missing signal fields', () => {
    const raw = `---
name: partial
need: 8
---
Body.`;

    const node = parseNodeContent(raw, 'test');
    expect(node.signals.need).toBe(8);
    expect(node.signals.confidence).toBe(0);
    expect(node.signals.conflict).toBe(0);
  });
});

describe('serializeNode / round-trip', () => {
  it('round-trips a node through serialize and parse', () => {
    const original: StigNode = {
      path: 'test/path',
      name: 'test-node',
      signals: {
        need: 6,
        confidence: 4,
        conflict: 2,
        workers_active: 1,
        last_pulse: '2025-01-01T00:00:00.000Z',
      },
      evidence: {
        acceptance_criteria: 3,
        examples: 2,
        risks: 1,
      },
      content: 'Some markdown content here.',
      isScaffold: false,
    };

    const serialized = serializeNode(original);
    const parsed = parseNodeContent(serialized, 'test/path');

    expect(parsed.name).toBe(original.name);
    expect(parsed.signals.need).toBe(original.signals.need);
    expect(parsed.signals.confidence).toBe(original.signals.confidence);
    expect(parsed.signals.conflict).toBe(original.signals.conflict);
    expect(parsed.evidence.acceptance_criteria).toBe(original.evidence.acceptance_criteria);
    expect(parsed.content).toBe(original.content);
    expect(parsed.isScaffold).toBe(false);
  });

  it('preserves scaffold flag', () => {
    const node: StigNode = {
      path: 'test',
      name: 'scaffold-node',
      signals: {
        need: 7,
        confidence: 0,
        conflict: 0,
        workers_active: 0,
        last_pulse: '2025-01-01T00:00:00.000Z',
      },
      evidence: { acceptance_criteria: 0, examples: 0, risks: 0 },
      content: 'Scaffold content.',
      isScaffold: true,
    };

    const serialized = serializeNode(node);
    const parsed = parseNodeContent(serialized, 'test');
    expect(parsed.isScaffold).toBe(true);
  });
});

describe('readNode / writeNode', () => {
  it('writes and reads a root node', () => {
    const node: StigNode = {
      path: '.',
      name: 'root',
      signals: {
        need: 10,
        confidence: 0,
        conflict: 0,
        workers_active: 0,
        last_pulse: '2025-01-01T00:00:00.000Z',
      },
      evidence: { acceptance_criteria: 0, examples: 0, risks: 0 },
      content: '# Goal\n\nBuild something.',
      isScaffold: false,
    };

    writeNode(tmpDir, '.', node);
    const read = readNode(tmpDir, '.');
    expect(read.name).toBe('root');
    expect(read.content).toBe('# Goal\n\nBuild something.');
  });

  it('writes and reads a child node', () => {
    const node: StigNode = {
      path: 'platform',
      name: 'platform',
      signals: {
        need: 5,
        confidence: 0,
        conflict: 0,
        workers_active: 0,
        last_pulse: '2025-01-01T00:00:00.000Z',
      },
      evidence: { acceptance_criteria: 0, examples: 0, risks: 0 },
      content: 'Platform decisions.',
      isScaffold: false,
    };

    writeNode(tmpDir, 'platform', node);
    const read = readNode(tmpDir, 'platform');
    expect(read.name).toBe('platform');
    expect(read.content).toBe('Platform decisions.');
  });
});

describe('listChildren', () => {
  it('returns child directories with _node.md', () => {
    // Create root
    writeFileSync(join(tmpDir, 'root.md'), '---\nname: root\n---\n', 'utf-8');

    // Create children
    mkdirSync(join(tmpDir, 'alpha'));
    writeFileSync(join(tmpDir, 'alpha', '_node.md'), '---\nname: alpha\n---\n', 'utf-8');

    mkdirSync(join(tmpDir, 'beta'));
    writeFileSync(join(tmpDir, 'beta', '_node.md'), '---\nname: beta\n---\n', 'utf-8');

    // Create a directory without _node.md (should be excluded)
    mkdirSync(join(tmpDir, 'empty-dir'));

    const children = listChildren(tmpDir, '.');
    expect(children).toEqual(['alpha', 'beta']);
  });

  it('returns empty array for non-existent path', () => {
    const children = listChildren(tmpDir, 'nonexistent');
    expect(children).toEqual([]);
  });
});

describe('nodeExists', () => {
  it('returns true for existing root', () => {
    writeFileSync(join(tmpDir, 'root.md'), '---\nname: root\n---\n', 'utf-8');
    expect(nodeExists(tmpDir, '.')).toBe(true);
  });

  it('returns false for missing node', () => {
    expect(nodeExists(tmpDir, 'nope')).toBe(false);
  });

  it('returns true for existing child', () => {
    mkdirSync(join(tmpDir, 'child'));
    writeFileSync(join(tmpDir, 'child', '_node.md'), '---\nname: child\n---\n', 'utf-8');
    expect(nodeExists(tmpDir, 'child')).toBe(true);
  });
});
