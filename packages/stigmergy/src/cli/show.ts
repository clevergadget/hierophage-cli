import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { readNode, listChildren, nodeExists } from '../tree/node.js';
import { buildContextChain, assembleContext } from '../tree/context-chain.js';

export function showCommand(stigRoot: string, nodePath: string): void {
  const workspacePath = join(stigRoot, 'workspace');

  if (!existsSync(join(workspacePath, 'root.md'))) {
    console.error(chalk.red('No workspace found. Run `hierophage stig init "your goal"` first.'));
    process.exit(1);
  }

  if (!nodeExists(workspacePath, nodePath)) {
    console.error(chalk.red(`Node not found: ${nodePath}`));
    process.exit(1);
  }

  const node = readNode(workspacePath, nodePath);
  const chain = buildContextChain(workspacePath, nodePath);
  const children = listChildren(workspacePath, nodePath);

  // Header
  console.log(chalk.bold(`\n${node.name}`));
  console.log(chalk.dim(`path: ${node.path}`));
  if (node.isScaffold) {
    console.log(chalk.dim('[scaffold]'));
  }

  // Signals
  console.log('');
  console.log(chalk.bold('Signals:'));
  console.log(`  need:       ${formatSignal(node.signals.need, 'need')}`);
  console.log(`  confidence: ${formatSignal(node.signals.confidence, 'confidence')}`);
  console.log(`  conflict:   ${formatSignal(node.signals.conflict, 'conflict')}`);
  console.log(`  workers:    ${node.signals.workers_active}`);
  console.log(`  last pulse: ${chalk.dim(node.signals.last_pulse)}`);

  // Evidence
  console.log('');
  console.log(chalk.bold('Evidence:'));
  console.log(`  acceptance criteria: ${node.evidence.acceptance_criteria}`);
  console.log(`  examples:            ${node.evidence.examples}`);
  console.log(`  risks:               ${node.evidence.risks}`);

  // Children
  if (children.length > 0) {
    console.log('');
    console.log(chalk.bold(`Children (${children.length}):`));
    for (const child of children) {
      const childNode = readNode(workspacePath, child);
      const color = childNode.signals.conflict > 2 ? chalk.red : childNode.signals.confidence >= 8 ? chalk.green : chalk.yellow;
      console.log(`  ${color('●')} ${childNode.name} [n:${childNode.signals.need} c:${childNode.signals.confidence}]`);
    }
  }

  // Context chain
  console.log('');
  console.log(chalk.bold('Context Chain:'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log(assembleContext(chain));
}

function formatSignal(value: number, type: string): string {
  let color: typeof chalk.green;
  if (type === 'need') {
    color = value <= 2 ? chalk.green : value >= 7 ? chalk.red : chalk.yellow;
  } else if (type === 'confidence') {
    color = value >= 8 ? chalk.green : value <= 2 ? chalk.red : chalk.yellow;
  } else {
    // conflict
    color = value <= 1 ? chalk.green : value >= 3 ? chalk.red : chalk.yellow;
  }
  return color(String(value));
}
