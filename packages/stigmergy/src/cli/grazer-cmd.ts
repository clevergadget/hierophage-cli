import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { scanTree } from '../tree/scanner.js';
import { Grazer } from '../agents/grazer.js';
import { MutationDispatcher } from '../dispatch/dispatcher.js';

export async function grazerCommand(
  stigRoot: string,
  options: { prune?: boolean },
): Promise<void> {
  const workspacePath = join(stigRoot, 'workspace');

  if (!existsSync(join(workspacePath, 'root.md'))) {
    console.error(chalk.red('No workspace found. Run `stig init "your goal"` first.'));
    process.exit(1);
  }

  // Estimate pulses from mutations.log if it exists
  let pulsesElapsed = 0;
  const logPath = join(stigRoot, 'mutations.log');
  if (existsSync(logPath)) {
    try {
      const log = readFileSync(logPath, 'utf-8');
      // Each pulse logs at least one mutation, count unique timestamps as proxy
      const timestamps = new Set(log.split('\n').filter(Boolean).map((line) => {
        const match = line.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
        return match?.[1];
      }));
      pulsesElapsed = Math.max(timestamps.size, 0);
    } catch {
      // Ignore read errors
    }
  }

  const nodes = scanTree(workspacePath);
  const grazer = new Grazer();
  const report = grazer.patrol(nodes, workspacePath, pulsesElapsed);

  console.log(chalk.bold('Grazer Patrol Report (Necrophoresis)'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log(`Pulses elapsed: ${pulsesElapsed}`);
  console.log('');

  // Stagnant nodes
  if (report.stagnantNodes.length > 0) {
    console.log(chalk.red(`Stagnant nodes (no progress): ${report.stagnantNodes.length}`));
    for (const path of report.stagnantNodes.slice(0, 10)) {
      console.log(chalk.dim(`  - ${path}`));
    }
    if (report.stagnantNodes.length > 10) {
      console.log(chalk.dim(`  ... and ${report.stagnantNodes.length - 10} more`));
    }
    console.log('');
  }

  // Placeholder nodes
  if (report.placeholderNodes.length > 0) {
    console.log(chalk.yellow(`Placeholder nodes (TBD, minimal content): ${report.placeholderNodes.length}`));
    for (const path of report.placeholderNodes.slice(0, 10)) {
      console.log(chalk.dim(`  - ${path}`));
    }
    if (report.placeholderNodes.length > 10) {
      console.log(chalk.dim(`  ... and ${report.placeholderNodes.length - 10} more`));
    }
    console.log('');
  }

  // Withered branches
  if (report.witheredBranches.length > 0) {
    console.log(chalk.yellow(`Withered branches (deep, lonely, childless): ${report.witheredBranches.length}`));
    for (const path of report.witheredBranches.slice(0, 10)) {
      console.log(chalk.dim(`  - ${path}`));
    }
    if (report.witheredBranches.length > 10) {
      console.log(chalk.dim(`  ... and ${report.witheredBranches.length - 10} more`));
    }
    console.log('');
  }

  // Summary
  console.log(chalk.dim('─'.repeat(50)));
  const totalIssues = report.stagnantNodes.length + report.placeholderNodes.length + report.witheredBranches.length;
  if (totalIssues === 0) {
    console.log(chalk.green('No dead nodes found. The colony is healthy.'));
  } else {
    console.log(`Total dead nodes: ${chalk.bold(String(totalIssues))}`);
    console.log(`Pruning mutations ready: ${chalk.bold(String(report.mutations.length))}`);
  }

  // Apply pruning if requested
  if (options.prune && report.mutations.length > 0) {
    console.log('');
    console.log(chalk.red.bold('PRUNING NODES (irreversible)...'));
    const dispatcher = new MutationDispatcher(stigRoot);
    let pruned = 0;
    for (const mutation of report.mutations) {
      const result = dispatcher.dispatch(mutation);
      if (result.success) {
        pruned++;
        console.log(chalk.dim(`  Pruned: ${mutation.path}`));
      } else {
        console.log(chalk.yellow(`  Failed: ${mutation.path} - ${result.error}`));
      }
    }
    console.log(chalk.green(`Pruned ${pruned}/${report.mutations.length} nodes.`));
  } else if (report.mutations.length > 0) {
    console.log('');
    console.log(chalk.dim('Run with --prune to delete dead nodes (irreversible).'));
    console.log(chalk.dim('Review the list above before pruning.'));
  }
}
