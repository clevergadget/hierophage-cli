import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { Weaver } from '../agents/weaver.js';
import { scanTree } from '../tree/scanner.js';
import { MutationDispatcher } from '../dispatch/dispatcher.js';

export async function weaveCommand(
  stigRoot: string,
  options: { apply?: boolean },
): Promise<void> {
  const workspacePath = join(stigRoot, 'workspace');

  if (!existsSync(join(workspacePath, 'root.md'))) {
    console.error(chalk.red('No workspace found. Run `stig init "your goal"` first.'));
    process.exit(1);
  }

  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    console.error(chalk.red('GEMINI_API_KEY is required for weaving.'));
    process.exit(1);
  }

  console.log('Scanning tree for cross-branch semantic overlaps...');
  console.log('');

  const nodes = scanTree(workspacePath);
  const weaver = new Weaver('gemini-2.5-flash-lite', apiKey);

  const result = await weaver.weave(nodes);

  if (result.overlaps.length === 0) {
    console.log(chalk.green('No cross-branch overlaps found.'));
  } else {
    console.log(chalk.bold(`Found ${result.overlaps.length} cross-branch overlap(s):`));
    console.log('');

    for (const overlap of result.overlaps) {
      const recLabel = {
        merge: chalk.magenta('[MERGE]'),
        link: chalk.cyan('[LINK]'),
        keep_separate: chalk.dim('[KEEP SEPARATE]'),
      }[overlap.recommendation];

      console.log(`${recLabel} ${overlap.reason}`);
      console.log(chalk.dim(`  A: ${overlap.node_a}`));
      console.log(chalk.dim(`  B: ${overlap.node_b}`));
      console.log('');
    }
  }

  // Apply mutations if requested
  if (options.apply && result.mutations.length > 0) {
    console.log(chalk.dim(`Applying ${result.mutations.length} conflict signals...`));

    const dispatcher = new MutationDispatcher(stigRoot);
    let succeeded = 0;
    let failed = 0;

    for (const mutation of result.mutations) {
      const mutResult = dispatcher.dispatch(mutation);
      if (mutResult.success) {
        succeeded++;
      } else {
        failed++;
      }
    }

    console.log(`Applied: ${chalk.green(String(succeeded))} succeeded, ${chalk.red(String(failed))} failed`);
  } else if (result.mutations.length > 0) {
    console.log(chalk.dim(`Would flag ${result.mutations.length / 2} node pairs with conflict.`));
    console.log(chalk.dim('Pass --apply to add conflict signals.'));
  }

  // Cost summary
  console.log('');
  console.log(chalk.dim('─'.repeat(50)));
  console.log(
    `Cost: ${chalk.bold(String(result.cost.api_calls))} API call | ` +
    `${chalk.bold(String(result.cost.input_tokens))} input tokens | ` +
    `${chalk.bold(String(result.cost.output_tokens))} output tokens`,
  );
}
