import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MockCrystallizer } from '../src/crystal/mock-crystallizer.js';
import { formatNodesForPrompt } from '../src/crystal/prompts.js';
import { writeNode } from '../src/tree/node.js';
import type { StigNode } from '../src/types.js';

let tmpDir: string;
let stigRoot: string;

function makeNode(path: string, name: string, overrides?: Partial<StigNode>): StigNode {
  return {
    path,
    name,
    signals: {
      need: 5,
      confidence: 6,
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

  // Root
  writeNode(workspacePath, '.', makeNode('.', 'root', {
    content: 'Build a task management API',
    signals: { need: 2, confidence: 8, conflict: 0, workers_active: 0, last_pulse: '' },
  }));

  // Branch: architecture
  writeNode(workspacePath, 'architecture', makeNode('architecture', 'Architecture', {
    content: 'System architecture decisions',
    isScaffold: true,
  }));
  writeNode(workspacePath, 'architecture/database', makeNode('architecture/database', 'Database Design', {
    content: 'PostgreSQL with normalized schema. Tables: tasks, users, labels.',
  }));
  writeNode(workspacePath, 'architecture/api-layer', makeNode('architecture/api-layer', 'API Layer', {
    content: 'REST API with Express.js. JSON request/response.',
  }));

  // Branch: testing
  writeNode(workspacePath, 'testing', makeNode('testing', 'Testing', {
    content: 'Testing strategy',
    isScaffold: true,
  }));
  writeNode(workspacePath, 'testing/unit', makeNode('testing/unit', 'Unit Tests', {
    content: 'Vitest for unit tests. 80% coverage target.',
  }));

  // Branch: deployment (single node, no children)
  writeNode(workspacePath, 'deployment', makeNode('deployment', 'Deployment', {
    content: 'Docker + fly.io deployment',
    isScaffold: true,
  }));
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'stig-crystal-'));
  setupWorkspace();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('MockCrystallizer', () => {
  it('produces files for all branches', async () => {
    const crystallizer = new MockCrystallizer();
    const result = await crystallizer.crystallize(stigRoot);

    expect(result.branches).toHaveLength(3);

    const branchNames = result.branches.map((b) => b.branch).sort();
    expect(branchNames).toEqual(['architecture', 'deployment', 'testing']);

    for (const branch of result.branches) {
      expect(existsSync(branch.outputPath)).toBe(true);
    }
  });

  it('reports zero cost', async () => {
    const crystallizer = new MockCrystallizer();
    const result = await crystallizer.crystallize(stigRoot);

    expect(result.totalCost).toEqual({ api_calls: 0, input_tokens: 0, output_tokens: 0 });
    for (const branch of result.branches) {
      expect(branch.cost.api_calls).toBe(0);
    }
  });

  it('output includes node content from leaves', async () => {
    const crystallizer = new MockCrystallizer();
    const result = await crystallizer.crystallize(stigRoot);

    const archBranch = result.branches.find((b) => b.branch === 'architecture')!;
    const content = readFileSync(archBranch.outputPath, 'utf-8');

    expect(content).toContain('PostgreSQL');
    expect(content).toContain('Express.js');
  });

  it('respects branch filter', async () => {
    const crystallizer = new MockCrystallizer();
    const result = await crystallizer.crystallize(stigRoot, {
      branches: ['testing'],
    });

    expect(result.branches).toHaveLength(1);
    expect(result.branches[0].branch).toBe('testing');
  });

  it('creates output dir if missing', async () => {
    const outputDir = join(tmpDir, 'custom', 'output');
    expect(existsSync(outputDir)).toBe(false);

    const crystallizer = new MockCrystallizer();
    await crystallizer.crystallize(stigRoot, { outputDir });

    expect(existsSync(outputDir)).toBe(true);
  });

  it('re-run overwrites previous output', async () => {
    const crystallizer = new MockCrystallizer();

    await crystallizer.crystallize(stigRoot);
    const firstContent = readFileSync(
      join(stigRoot, 'crystals', 'architecture.md'),
      'utf-8',
    );

    // Add a new node and re-crystallize
    const workspacePath = join(stigRoot, 'workspace');
    writeNode(workspacePath, 'architecture/caching', makeNode('architecture/caching', 'Caching', {
      content: 'Redis caching layer for hot paths.',
    }));

    await crystallizer.crystallize(stigRoot);
    const secondContent = readFileSync(
      join(stigRoot, 'crystals', 'architecture.md'),
      'utf-8',
    );

    expect(secondContent).toContain('Redis');
    expect(secondContent).not.toEqual(firstContent);
  });

  it('handles single-node branches', async () => {
    const crystallizer = new MockCrystallizer();
    const result = await crystallizer.crystallize(stigRoot);

    const deployBranch = result.branches.find((b) => b.branch === 'deployment')!;
    expect(deployBranch.nodeCount).toBe(1);

    const content = readFileSync(deployBranch.outputPath, 'utf-8');
    expect(content).toContain('Docker');
  });

  it('produces overview document', async () => {
    const crystallizer = new MockCrystallizer();
    const result = await crystallizer.crystallize(stigRoot);

    expect(result.overview).toBeDefined();
    expect(existsSync(result.overview!.outputPath)).toBe(true);

    const content = readFileSync(result.overview!.outputPath, 'utf-8');
    expect(content).toContain('Overview');
    expect(content).toContain('Build a task management API');
  });

  it('skips overview when requested', async () => {
    const crystallizer = new MockCrystallizer();
    const result = await crystallizer.crystallize(stigRoot, { skipOverview: true });

    expect(result.overview).toBeUndefined();
  });
});

describe('formatNodesForPrompt', () => {
  it('formats nodes with depth-based headers', () => {
    const nodes: StigNode[] = [
      makeNode('architecture', 'Architecture', { content: 'System design' }),
      makeNode('architecture/database', 'Database', { content: 'PostgreSQL' }),
      makeNode('architecture/database/schema', 'Schema', { content: 'Normalized tables' }),
    ];

    const result = formatNodesForPrompt(nodes, 'architecture');

    expect(result).toContain('## architecture');
    expect(result).toContain('### architecture/database');
    expect(result).toContain('#### architecture/database/schema');
    expect(result).toContain('System design');
    expect(result).toContain('PostgreSQL');
    expect(result).toContain('Normalized tables');
  });

  it('includes signal levels', () => {
    const nodes: StigNode[] = [
      makeNode('testing', 'Testing', {
        signals: { need: 7, confidence: 3, conflict: 2, workers_active: 0, last_pulse: '' },
      }),
    ];

    const result = formatNodesForPrompt(nodes, 'testing');
    expect(result).toContain('[need:7 confidence:3 conflict:2]');
  });
});
