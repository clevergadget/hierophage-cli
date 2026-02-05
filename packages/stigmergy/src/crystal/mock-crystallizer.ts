import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanTree } from '../tree/scanner.js';
import { formatNodesForPrompt, diagnoseTreeHealth } from './prompts.js';
import type { AgentCost } from '../agents/agent.js';
import type { StigNode } from '../types.js';

export interface CrystalResult {
  branch: string;
  outputPath: string;
  cost: AgentCost;
  nodeCount: number;
  error?: string;
}

export interface CrystallizeResult {
  branches: CrystalResult[];
  overview?: { outputPath: string; cost: AgentCost; error?: string };
  totalCost: AgentCost;
}

export interface CrystallizerOptions {
  outputDir?: string;
  branches?: string[];
  skipOverview?: boolean;
}

const ZERO_COST: AgentCost = { api_calls: 0, input_tokens: 0, output_tokens: 0 };

/**
 * MockCrystallizer: produces deterministic markdown output with zero API calls.
 * Formats node content with headers based on depth. For --dry-run validation.
 */
export class MockCrystallizer {
  readonly name = 'MockCrystallizer';
  readonly isRealAI = false;

  async crystallize(
    stigRoot: string,
    options: CrystallizerOptions = {},
  ): Promise<CrystallizeResult> {
    const workspacePath = join(stigRoot, 'workspace');
    const outputDir = options.outputDir ?? join(stigRoot, 'crystals');

    mkdirSync(outputDir, { recursive: true });

    const allNodes = scanTree(workspacePath);
    const root = allNodes.find((n) => n.path === '.');
    const rootGoal = root?.content ?? 'No goal specified';

    // Group nodes by top-level branch
    const branchMap = groupByBranch(allNodes, options.branches);

    const results: CrystalResult[] = [];

    for (const [branchName, nodes] of branchMap) {
      const formatted = formatNodesForPrompt(nodes, branchName);
      const health = diagnoseTreeHealth(nodes);
      const healthSection = health.length > 0
        ? `\n## Tree Health\n\n${health.map((h) => `- **${h.node}**: ${h.issue}`).join('\n')}\n`
        : '\n## Tree Health\n\nNo issues detected.\n';
      const content = `# ${branchName}\n\n${formatted}${healthSection}`;
      const outputPath = join(outputDir, `${branchName}.md`);

      writeFileSync(outputPath, content, 'utf-8');

      results.push({
        branch: branchName,
        outputPath,
        cost: { ...ZERO_COST },
        nodeCount: nodes.length,
      });
    }

    // Overview: concatenate branch openings + tree health
    let overview: CrystallizeResult['overview'];
    if (!options.skipOverview && results.length > 0) {
      const allHealth = diagnoseTreeHealth(allNodes);
      const overviewParts = [`# Overview\n\n**Goal:** ${rootGoal}\n`];
      for (const r of results) {
        overviewParts.push(`## ${r.branch}\n\n${r.nodeCount} nodes crystallized.\n`);
      }
      if (allHealth.length > 0) {
        overviewParts.push(`## Tree Health\n\n${allHealth.map((h) => `- **${h.node}**: ${h.issue}`).join('\n')}\n`);
      }
      const overviewPath = join(outputDir, 'overview.md');
      writeFileSync(overviewPath, overviewParts.join('\n'), 'utf-8');
      overview = { outputPath: overviewPath, cost: { ...ZERO_COST } };
    }

    return {
      branches: results,
      overview,
      totalCost: { ...ZERO_COST },
    };
  }
}

/**
 * Group nodes by their top-level branch (first path segment).
 * Excludes root node. If branchFilter is provided, only includes those branches.
 */
export function groupByBranch(
  nodes: StigNode[],
  branchFilter?: string[],
): Map<string, StigNode[]> {
  const map = new Map<string, StigNode[]>();

  for (const node of nodes) {
    if (node.path === '.') continue; // skip root

    const topLevel = node.path.split('/')[0];

    if (branchFilter && branchFilter.length > 0 && !branchFilter.includes(topLevel)) {
      continue;
    }

    if (!map.has(topLevel)) {
      map.set(topLevel, []);
    }
    map.get(topLevel)!.push(node);
  }

  // Sort nodes within each branch by path (depth-first ordering)
  for (const [, nodes] of map) {
    nodes.sort((a, b) => a.path.localeCompare(b.path));
  }

  return map;
}
