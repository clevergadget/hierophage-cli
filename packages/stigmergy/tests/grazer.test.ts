import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeNode } from '../src/tree/node.js';
import { Grazer } from '../src/agents/grazer.js';
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
    content: 'Some substantive content about this concern that is long enough.',
    isScaffold: false,
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'stig-grazer-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('Grazer', () => {
  describe('stagnant node detection', () => {
    it('does not flag nodes when pulses < 10', () => {
      const nodes = [
        makeNode('.', 'root'),
        makeNode('stagnant', 'stagnant', {
          signals: { need: 8, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' },
          content: '', // empty
        }),
      ];
      writeNode(tmpDir, '.', nodes[0]);
      writeNode(tmpDir, 'stagnant', nodes[1]);

      const grazer = new Grazer();
      const report = grazer.patrol(nodes, tmpDir, 5); // Only 5 pulses

      expect(report.stagnantNodes).toHaveLength(0);
    });

    it('flags stagnant nodes after 10 pulses', () => {
      const nodes = [
        makeNode('.', 'root'),
        makeNode('stagnant', 'stagnant', {
          signals: { need: 8, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' },
          content: '', // empty
        }),
      ];
      writeNode(tmpDir, '.', nodes[0]);
      writeNode(tmpDir, 'stagnant', nodes[1]);

      const grazer = new Grazer();
      const report = grazer.patrol(nodes, tmpDir, 15);

      expect(report.stagnantNodes).toContain('stagnant');
      expect(report.mutations.length).toBeGreaterThan(0);
    });

    it('does not flag stagnant nodes with children', () => {
      const nodes = [
        makeNode('.', 'root'),
        makeNode('parent', 'parent', {
          signals: { need: 8, confidence: 0, conflict: 0, workers_active: 0, last_pulse: '' },
        }),
        makeNode('parent/child', 'child'),
      ];
      writeNode(tmpDir, '.', nodes[0]);
      writeNode(tmpDir, 'parent', nodes[1]);
      writeNode(tmpDir, 'parent/child', nodes[2]);

      const grazer = new Grazer();
      const report = grazer.patrol(nodes, tmpDir, 15);

      expect(report.stagnantNodes).not.toContain('parent');
    });
  });

  describe('placeholder detection', () => {
    it('flags nodes with empty content', () => {
      const nodes = [
        makeNode('.', 'root'),
        makeNode('empty', 'empty', { content: '' }),
      ];
      writeNode(tmpDir, '.', nodes[0]);
      writeNode(tmpDir, 'empty', nodes[1]);

      const grazer = new Grazer();
      const report = grazer.patrol(nodes, tmpDir);

      expect(report.placeholderNodes).toContain('empty');
    });

    it('flags nodes with TBD content', () => {
      const nodes = [
        makeNode('.', 'root'),
        makeNode('tbd', 'tbd', { content: 'TBD' }),
      ];
      writeNode(tmpDir, '.', nodes[0]);
      writeNode(tmpDir, 'tbd', nodes[1]);

      const grazer = new Grazer();
      const report = grazer.patrol(nodes, tmpDir);

      expect(report.placeholderNodes).toContain('tbd');
    });

    it('does not flag empty content with high confidence', () => {
      const nodes = [
        makeNode('.', 'root'),
        makeNode('intentional', 'intentional', {
          content: 'Brief.',
          signals: { need: 1, confidence: 8, conflict: 0, workers_active: 0, last_pulse: '' },
        }),
      ];
      writeNode(tmpDir, '.', nodes[0]);
      writeNode(tmpDir, 'intentional', nodes[1]);

      const grazer = new Grazer();
      const report = grazer.patrol(nodes, tmpDir);

      expect(report.placeholderNodes).not.toContain('intentional');
    });
  });

  describe('withered branch detection', () => {
    it('flags deep, childless, alone nodes', () => {
      // Create a deep branch with a single leaf
      const nodes = [
        makeNode('.', 'root'),
        makeNode('a', 'a'),
        makeNode('a/b', 'b'),
        makeNode('a/b/c', 'c'),
        makeNode('a/b/c/d', 'd'), // depth 4, no siblings under c, no children
      ];
      writeNode(tmpDir, '.', nodes[0]);
      writeNode(tmpDir, 'a', nodes[1]);
      writeNode(tmpDir, 'a/b', nodes[2]);
      writeNode(tmpDir, 'a/b/c', nodes[3]);
      writeNode(tmpDir, 'a/b/c/d', nodes[4]);

      const grazer = new Grazer();
      const report = grazer.patrol(nodes, tmpDir);

      expect(report.witheredBranches).toContain('a/b/c/d');
    });

    it('does not flag deep nodes with siblings', () => {
      const nodes = [
        makeNode('.', 'root'),
        makeNode('a', 'a'),
        makeNode('a/b', 'b'),
        makeNode('a/b/c', 'c'),
        makeNode('a/b/c/d', 'd'),
        makeNode('a/b/c/e', 'e'), // sibling of d
      ];
      writeNode(tmpDir, '.', nodes[0]);
      writeNode(tmpDir, 'a', nodes[1]);
      writeNode(tmpDir, 'a/b', nodes[2]);
      writeNode(tmpDir, 'a/b/c', nodes[3]);
      writeNode(tmpDir, 'a/b/c/d', nodes[4]);
      writeNode(tmpDir, 'a/b/c/e', nodes[5]);

      const grazer = new Grazer();
      const report = grazer.patrol(nodes, tmpDir);

      expect(report.witheredBranches).not.toContain('a/b/c/d');
      expect(report.witheredBranches).not.toContain('a/b/c/e');
    });
  });

  describe('mutation generation', () => {
    it('generates DELETE_NODE mutations for all dead nodes', () => {
      const nodes = [
        makeNode('.', 'root'),
        makeNode('tbd', 'tbd', { content: 'TBD' }),
        makeNode('empty', 'empty', { content: '' }),
      ];
      writeNode(tmpDir, '.', nodes[0]);
      writeNode(tmpDir, 'tbd', nodes[1]);
      writeNode(tmpDir, 'empty', nodes[2]);

      const grazer = new Grazer();
      const report = grazer.patrol(nodes, tmpDir);

      expect(report.mutations.length).toBe(2);
      expect(report.mutations.every((m) => m.type === 'DELETE_NODE')).toBe(true);
    });

    it('never generates mutations for root', () => {
      const nodes = [
        makeNode('.', 'root', { content: '' }), // empty root
      ];
      writeNode(tmpDir, '.', nodes[0]);

      const grazer = new Grazer();
      const report = grazer.patrol(nodes, tmpDir, 100);

      expect(report.mutations).toHaveLength(0);
    });

    it('never generates mutations for scaffolds', () => {
      const nodes = [
        makeNode('.', 'root'),
        makeNode('scaffold', 'scaffold', { content: '', isScaffold: true }),
      ];
      writeNode(tmpDir, '.', nodes[0]);
      writeNode(tmpDir, 'scaffold', nodes[1]);

      const grazer = new Grazer();
      const report = grazer.patrol(nodes, tmpDir);

      expect(report.mutations.find((m) => m.path === 'scaffold')).toBeUndefined();
    });
  });
});
