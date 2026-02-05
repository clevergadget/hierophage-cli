import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { scanTree, getTreeStats } from '../tree/scanner.js';
import { listChildren } from '../tree/node.js';
import type { StigNode } from '../types.js';

export function statusCommand(stigRoot: string): void {
  const workspacePath = join(stigRoot, 'workspace');

  if (!existsSync(join(workspacePath, 'root.md'))) {
    console.error(chalk.red('No workspace found. Run `hierophage stig init "your goal"` first.'));
    process.exit(1);
  }

  const nodes = scanTree(workspacePath);
  const stats = getTreeStats(nodes);

  // Build tree display
  const root = nodes.find((n) => n.path === '.');
  if (root) {
    console.log(formatNodeLine(root, '', true));
    printChildren(workspacePath, '.', nodes, '');
  }

  // Stats footer
  console.log('');
  console.log(chalk.dim('─'.repeat(50)));
  console.log(
    `${chalk.bold(String(stats.total_nodes))} nodes | ` +
      `avg confidence: ${chalk.bold(String(stats.avg_confidence))} | ` +
      `avg need: ${chalk.bold(String(stats.avg_need))} | ` +
      `${chalk.green(String(stats.stable_count))} stable | ` +
      `${chalk.red(String(stats.nodes_in_conflict))} conflict`,
  );
}

function printChildren(
  workspacePath: string,
  parentPath: string,
  allNodes: StigNode[],
  prefix: string,
): void {
  const children = listChildren(workspacePath, parentPath);

  for (let i = 0; i < children.length; i++) {
    const childPath = children[i];
    const isLast = i === children.length - 1;
    const node = allNodes.find((n) => n.path === childPath);
    if (!node) continue;

    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    console.log(prefix + connector + formatNodeLine(node, '', false));
    printChildren(workspacePath, childPath, allNodes, prefix + childPrefix);
  }
}

function formatNodeLine(node: StigNode, _prefix: string, isRoot: boolean): string {
  const label = isRoot
    ? chalk.bold(node.name)
    : node.isScaffold
      ? chalk.dim(`[scaffold] ${node.name}`)
      : node.name;

  const color = getSignalColor(node);
  const signals = color(
    `[n:${node.signals.need} c:${node.signals.confidence} x:${node.signals.conflict}]`,
  );

  return `${label} ${signals}`;
}

function getSignalColor(node: StigNode): typeof chalk.green {
  if (
    node.signals.confidence >= 8 &&
    node.signals.need <= 2 &&
    node.signals.conflict <= 1
  ) {
    return chalk.green;
  }
  if (node.signals.conflict > 2) {
    return chalk.red;
  }
  return chalk.yellow;
}
