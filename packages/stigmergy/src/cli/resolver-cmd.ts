import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { scanTree } from '../tree/scanner.js';
import { listChildren } from '../tree/node.js';
import { Resolver } from '../agents/resolver.js';
import { MutationDispatcher } from '../dispatch/dispatcher.js';
import type { StigNode } from '../types.js';

export async function resolverCommand(
  stigRoot: string,
  options: { max?: number; apply?: boolean },
): Promise<void> {
  const workspacePath = join(stigRoot, 'workspace');

  if (!existsSync(join(workspacePath, 'root.md'))) {
    console.error(chalk.red('No workspace found. Run `stig init "your goal"` first.'));
    process.exit(1);
  }

  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    console.error(chalk.red('GEMINI_API_KEY is required for the Resolver.'));
    process.exit(1);
  }

  const nodes = scanTree(workspacePath);
  const nodeMap = new Map(nodes.map((n) => [n.path, n]));

  const conflictNodes = nodes
    .filter((n) => n.signals.conflict > 0)
    .sort((a, b) => b.signals.conflict - a.signals.conflict);

  if (conflictNodes.length === 0) {
    console.log(chalk.green('No conflicts found. The tree is harmonious.'));
    return;
  }

  const maxNodes = options.max ?? 10;
  const toResolve = conflictNodes.slice(0, maxNodes);

  console.log(chalk.bold('Conflict Resolution'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log(`Found ${chalk.red(String(conflictNodes.length))} nodes with conflicts.`);
  console.log(`Attempting to resolve ${chalk.bold(String(toResolve.length))} (highest conflict first).\n`);

  const resolver = new Resolver('gemini-2.5-flash-lite', apiKey);
  const dispatcher = options.apply ? new MutationDispatcher(stigRoot) : null;

  let totalCost = { api_calls: 0, input_tokens: 0, output_tokens: 0 };
  let resolved = 0;
  let applied = 0;

  for (const node of toResolve) {
    // Get siblings
    const parentPath = getParentPath(node.path);
    const siblingPaths = listChildren(workspacePath, parentPath).filter((p) => p !== node.path);
    const siblings = siblingPaths.map((p) => nodeMap.get(p)).filter((n): n is StigNode => n !== undefined);

    // Get parent content
    const parent = nodeMap.get(parentPath);
    const parentContent = parent?.content;

    process.stdout.write(`  ${node.path} [conflict:${node.signals.conflict}] ... `);

    const result = await resolver.resolve(node, siblings, parentContent);

    totalCost.api_calls += result.cost.api_calls;
    totalCost.input_tokens += result.cost.input_tokens;
    totalCost.output_tokens += result.cost.output_tokens;

    if (result.error) {
      console.log(chalk.red(`error: ${result.error}`));
      continue;
    }

    if (result.resolved) {
      resolved++;
      console.log(chalk.green('resolved'));

      if (dispatcher && result.mutations.length > 0) {
        for (const mutation of result.mutations) {
          const dispatchResult = dispatcher.dispatch(mutation);
          if (dispatchResult.success) applied++;
        }
      }
    } else {
      console.log(chalk.yellow('not resolved'));
    }
  }

  console.log('');
  console.log(chalk.dim('─'.repeat(50)));
  console.log(`Resolved: ${chalk.green(String(resolved))}/${toResolve.length}`);
  if (options.apply) {
    console.log(`Applied: ${chalk.cyan(String(applied))} mutations`);
  }
  console.log(`Cost: ${totalCost.api_calls} calls, ${totalCost.input_tokens} input tokens, ${totalCost.output_tokens} output tokens`);

  if (!options.apply && resolved > 0) {
    console.log('');
    console.log(chalk.dim('Run with --apply to apply the resolutions.'));
  }
}

function getParentPath(nodePath: string): string {
  if (nodePath === '.' || nodePath === '') return '.';
  const parts = nodePath.split('/');
  return parts.length === 1 ? '.' : parts.slice(0, -1).join('/');
}
