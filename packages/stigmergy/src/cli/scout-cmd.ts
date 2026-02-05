import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { scanTree } from '../tree/scanner.js';
import { Scout } from '../agents/scout.js';
import { MutationDispatcher } from '../dispatch/dispatcher.js';

export async function scoutCommand(
  stigRoot: string,
  options: { fix?: boolean },
): Promise<void> {
  const workspacePath = join(stigRoot, 'workspace');

  if (!existsSync(join(workspacePath, 'root.md'))) {
    console.error(chalk.red('No workspace found. Run `stig init "your goal"` first.'));
    process.exit(1);
  }

  const nodes = scanTree(workspacePath);
  const scout = new Scout();
  const report = scout.patrol(nodes);

  console.log(chalk.bold('Scout Patrol Report'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log('');

  // Hollow nodes
  if (report.hollowNodes.length > 0) {
    console.log(chalk.red(`Hollow nodes (empty placeholders): ${report.hollowNodes.length}`));
    for (const path of report.hollowNodes.slice(0, 10)) {
      console.log(chalk.dim(`  - ${path}`));
    }
    if (report.hollowNodes.length > 10) {
      console.log(chalk.dim(`  ... and ${report.hollowNodes.length - 10} more`));
    }
    console.log('');
  }

  // Tautologies
  if (report.tautologies.length > 0) {
    console.log(chalk.yellow(`Tautologies (content restates name): ${report.tautologies.length}`));
    for (const path of report.tautologies.slice(0, 10)) {
      console.log(chalk.dim(`  - ${path}`));
    }
    if (report.tautologies.length > 10) {
      console.log(chalk.dim(`  ... and ${report.tautologies.length - 10} more`));
    }
    console.log('');
  }

  // Similar siblings
  if (report.similarSiblings.length > 0) {
    console.log(chalk.yellow(`Similar siblings (potential duplicates): ${report.similarSiblings.length}`));
    for (const pair of report.similarSiblings.slice(0, 5)) {
      console.log(chalk.dim(`  - ${pair.a}`));
      console.log(chalk.dim(`    ≈ ${pair.b}`));
    }
    if (report.similarSiblings.length > 5) {
      console.log(chalk.dim(`  ... and ${report.similarSiblings.length - 5} more pairs`));
    }
    console.log('');
  }

  // Low confidence
  if (report.lowConfidence.length > 0) {
    console.log(chalk.blue(`Low confidence nodes: ${report.lowConfidence.length}`));
    console.log(chalk.dim('  (These have content but need more work)'));
    console.log('');
  }

  // Summary
  console.log(chalk.dim('─'.repeat(50)));
  const totalIssues = report.hollowNodes.length + report.tautologies.length + report.similarSiblings.length;
  if (totalIssues === 0) {
    console.log(chalk.green('No critical issues found.'));
  } else {
    console.log(`Total issues: ${chalk.bold(String(totalIssues))}`);
    console.log(`Mutations ready: ${chalk.bold(String(report.mutations.length))} (conflict signals to raise)`);
  }

  // Apply fixes if requested
  if (options.fix && report.mutations.length > 0) {
    console.log('');
    console.log(chalk.yellow('Applying conflict signals...'));
    const dispatcher = new MutationDispatcher(stigRoot);
    let applied = 0;
    for (const mutation of report.mutations) {
      const result = dispatcher.dispatch(mutation);
      if (result.success) applied++;
    }
    console.log(chalk.green(`Applied ${applied}/${report.mutations.length} mutations.`));
  } else if (report.mutations.length > 0) {
    console.log('');
    console.log(chalk.dim('Run with --fix to apply conflict signals to problematic nodes.'));
  }
}
