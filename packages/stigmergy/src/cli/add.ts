import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { nodeExists } from '../tree/node.js';
import { MutationDispatcher } from '../dispatch/dispatcher.js';
import { createMutation } from '../dispatch/mutations.js';
import { DEFAULT_SIGNALS, SCAFFOLD_SIGNALS } from '../types.js';

export function addCommand(
  stigRoot: string,
  parentPath: string,
  name: string,
  options: { scaffold?: boolean },
): void {
  const workspacePath = join(stigRoot, 'workspace');

  if (!existsSync(join(workspacePath, 'root.md'))) {
    console.error(chalk.red('No workspace found. Run `hierophage stig init "your goal"` first.'));
    process.exit(1);
  }

  // Validate parent exists
  if (!nodeExists(workspacePath, parentPath)) {
    console.error(chalk.red(`Parent node not found: ${parentPath}`));
    process.exit(1);
  }

  // Build child path
  const childPath =
    parentPath === '.' || parentPath === '' ? name : `${parentPath}/${name}`;

  const isScaffold = options.scaffold ?? false;
  const signals = isScaffold
    ? { ...SCAFFOLD_SIGNALS, last_pulse: new Date().toISOString() }
    : { ...DEFAULT_SIGNALS, last_pulse: new Date().toISOString() };

  const dispatcher = new MutationDispatcher(stigRoot);
  const mutation = createMutation('CREATE_NODE', childPath, {
    name,
    signals,
    isScaffold,
    content: isScaffold
      ? `Scaffold node for ${name}. Awaiting decomposition.`
      : '',
  });

  const result = dispatcher.dispatch(mutation);

  if (result.success) {
    const label = isScaffold ? chalk.dim(`[scaffold] ${name}`) : name;
    console.log(chalk.green(`Created: ${label}`));
    console.log(chalk.dim(`  path: ${childPath}`));
  } else {
    console.error(chalk.red(`Failed: ${result.error}`));
    process.exit(1);
  }
}
