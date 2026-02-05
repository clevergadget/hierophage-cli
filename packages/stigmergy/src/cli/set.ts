import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { nodeExists, readNode } from '../tree/node.js';
import { MutationDispatcher } from '../dispatch/dispatcher.js';
import { createMutation } from '../dispatch/mutations.js';

const VALID_SIGNALS = ['need', 'confidence', 'conflict', 'workers_active'] as const;
type SignalName = (typeof VALID_SIGNALS)[number];

export function setCommand(
  stigRoot: string,
  nodePath: string,
  signal: string,
  value: string,
): void {
  const workspacePath = join(stigRoot, 'workspace');

  if (!existsSync(join(workspacePath, 'root.md'))) {
    console.error(chalk.red('No workspace found. Run `hierophage stig init "your goal"` first.'));
    process.exit(1);
  }

  if (!nodeExists(workspacePath, nodePath)) {
    console.error(chalk.red(`Node not found: ${nodePath}`));
    process.exit(1);
  }

  if (!VALID_SIGNALS.includes(signal as SignalName)) {
    console.error(chalk.red(`Invalid signal: ${signal}`));
    console.error(chalk.dim(`Valid signals: ${VALID_SIGNALS.join(', ')}`));
    process.exit(1);
  }

  const numValue = Number(value);
  if (isNaN(numValue) || numValue < 0 || numValue > 10) {
    console.error(chalk.red(`Invalid value: ${value} (must be 0-10)`));
    process.exit(1);
  }

  const existing = readNode(workspacePath, nodePath);
  const oldValue = existing.signals[signal as SignalName];

  const dispatcher = new MutationDispatcher(stigRoot);
  const mutation = createMutation('UPDATE_SIGNALS', nodePath, {
    signals: { [signal]: numValue },
  });

  const result = dispatcher.dispatch(mutation);

  if (result.success) {
    console.log(
      `${chalk.bold(nodePath)} ${signal}: ${chalk.dim(String(oldValue))} → ${chalk.bold(String(numValue))}`,
    );
  } else {
    console.error(chalk.red(`Failed: ${result.error}`));
    process.exit(1);
  }
}
