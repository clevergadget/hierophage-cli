import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { pulse } from '../simulation/pulse.js';
import { MockSpore } from '../agents/mock-spore.js';

export async function pulseCommand(stigRoot: string): Promise<void> {
  const workspacePath = join(stigRoot, 'workspace');

  if (!existsSync(join(workspacePath, 'root.md'))) {
    console.error(chalk.red('No workspace found. Run `hierophage stig init "your goal"` first.'));
    process.exit(1);
  }

  const agent = new MockSpore();

  console.log(chalk.dim(`Agent: ${agent.name}`));
  console.log('');

  const result = await pulse(stigRoot, agent, 1);

  if (!result) {
    console.log(chalk.yellow('No target found. Tree may be empty.'));
    return;
  }

  console.log(`Target: ${chalk.bold(result.target_name)} ${chalk.dim(`(${result.target_path})`)}`);
  console.log(`Mutations: ${chalk.green(String(result.mutations_succeeded))} applied` +
    (result.errors.length > 0 ? `, ${chalk.red(String(result.errors.length))} failed` : ''));

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.log(chalk.red(`  ${err}`));
    }
  }

  console.log('');
  const s = result.stats_after;
  console.log(
    `${chalk.bold(String(s.total_nodes))} nodes | ` +
    `avg confidence: ${chalk.bold(String(s.avg_confidence))} | ` +
    `${chalk.green(String(s.stable_count))} stable | ` +
    `${chalk.red(String(s.nodes_in_conflict))} conflict`,
  );
}
