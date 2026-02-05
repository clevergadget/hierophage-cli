import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { Synthesizer } from '../agents/synthesizer.js';
import { scanTree } from '../tree/scanner.js';
import { MutationDispatcher } from '../dispatch/dispatcher.js';

export async function synthesizeCommand(
  stigRoot: string,
  options: { dryRun?: boolean; confirm?: boolean; maxGroups?: number },
): Promise<void> {
  const workspacePath = join(stigRoot, 'workspace');

  if (!existsSync(join(workspacePath, 'root.md'))) {
    console.error(chalk.red('No workspace found. Run `stig init "your goal"` first.'));
    process.exit(1);
  }

  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    console.error(chalk.red('GEMINI_API_KEY is required for synthesis.'));
    process.exit(1);
  }

  const isDryRun = options.dryRun ?? false;

  // Confirmation gate for real operations
  if (!isDryRun && !options.confirm) {
    console.log(chalk.yellow('This will analyze the tree and synthesize semantic duplicates.'));
    console.log(chalk.dim('  Stable duplicates will be synthesized (LLM merges content, sources deleted)'));
    console.log(chalk.dim('  Non-stable duplicates will be flagged with conflict'));
    console.log('');
    console.log(chalk.yellow('Pass --confirm to proceed, or --dry-run to preview.'));
    process.exit(0);
  }

  const modeLabel = isDryRun ? chalk.cyan('[DRY RUN] ') : '';
  console.log(`${modeLabel}Scanning tree for semantic duplicates...`);
  console.log('');

  const nodes = scanTree(workspacePath);
  const synthesizer = new Synthesizer('gemini-2.5-flash-lite', apiKey);

  const result = await synthesizer.synthesize(nodes, {
    dryRun: isDryRun,
    maxGroups: options.maxGroups ?? 10,
  });

  // Report findings
  if (result.duplicateGroups.length === 0) {
    console.log(chalk.green('No semantic duplicates found.'));
  } else {
    console.log(chalk.bold(`Found ${result.duplicateGroups.length} duplicate group(s):`));
    console.log('');

    for (const group of result.duplicateGroups) {
      const actionLabel = group.action === 'synthesized'
        ? chalk.green('[SYNTHESIZED]')
        : chalk.yellow('[FLAGGED]');

      console.log(`${actionLabel} ${group.reason}`);
      console.log(chalk.dim(`  Canonical: ${group.canonical}`));
      console.log(chalk.dim(`  Consumed: ${group.paths.filter(p => p !== group.canonical).join(', ')}`));
      console.log('');
    }
  }

  // Apply mutations if not dry run
  if (!isDryRun && result.mutations.length > 0) {
    console.log(chalk.dim(`Applying ${result.mutations.length} mutations...`));

    const dispatcher = new MutationDispatcher(stigRoot);
    let succeeded = 0;
    let failed = 0;

    for (const mutation of result.mutations) {
      const mutResult = dispatcher.dispatch(mutation);
      if (mutResult.success) {
        succeeded++;
        if (mutation.type === 'MERGE_NODES') {
          const sources = mutation.payload.merge_sources ?? [];
          console.log(chalk.green(`  ✓ MERGE ${mutation.path} ← ${sources.length} sources`));
        }
      } else {
        failed++;
        console.error(chalk.red(`  ✗ ${mutation.type} ${mutation.path} - ${mutResult.error}`));
      }
    }

    console.log(`Applied: ${chalk.green(String(succeeded))} succeeded, ${chalk.red(String(failed))} failed`);
  } else if (isDryRun && result.mutations.length > 0) {
    console.log(chalk.dim(`Would apply ${result.mutations.length} mutations:`));
    for (const m of result.mutations) {
      if (m.type === 'MERGE_NODES') {
        const sources = m.payload.merge_sources ?? [];
        console.log(`  ${chalk.magenta('MERGE')} ${m.path} ← [${sources.join(', ')}]`);
      } else {
        const typeLabel = m.type === 'DELETE_NODE' ? chalk.red(m.type) : chalk.blue(m.type);
        console.log(`  ${typeLabel} ${m.path}`);
      }
    }
  }

  // Cost summary
  console.log('');
  console.log(chalk.dim('─'.repeat(50)));
  console.log(
    `Cost: ${chalk.bold(String(result.cost.api_calls))} API calls | ` +
    `${chalk.bold(String(result.cost.input_tokens))} input tokens | ` +
    `${chalk.bold(String(result.cost.output_tokens))} output tokens`,
  );
}

// Backwards compatibility alias
export { synthesizeCommand as consolidateCommand };
