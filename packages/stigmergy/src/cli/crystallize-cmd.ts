import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { MockCrystallizer } from '../crystal/mock-crystallizer.js';
import { Crystallizer } from '../crystal/crystallizer.js';
import { DEFAULT_CONFIG } from '../types.js';
import type { WorkspaceConfig } from '../types.js';
import type { CrystallizeResult } from '../crystal/mock-crystallizer.js';

export async function crystallizeCommand(
  stigRoot: string,
  options: {
    branch?: string;
    output?: string;
    dryRun?: boolean;
    confirm?: boolean;
    skipOverview?: boolean;
  },
): Promise<void> {
  const workspacePath = join(stigRoot, 'workspace');

  if (!existsSync(join(workspacePath, 'root.md'))) {
    console.error(chalk.red('No workspace found. Run `hierophage stig init "your goal"` first.'));
    process.exit(1);
  }

  const config = loadConfig(stigRoot);
  const isDryRun = options.dryRun ?? false;

  let crystallizer: MockCrystallizer | Crystallizer;

  if (isDryRun) {
    crystallizer = new MockCrystallizer();
  } else {
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) {
      console.error(chalk.red('GEMINI_API_KEY is required for real AI crystallization.'));
      console.error(chalk.dim('  Set it: export GEMINI_API_KEY=your-key'));
      console.error(chalk.dim('  Or use: stig crystallize --dry-run'));
      process.exit(1);
    }
    crystallizer = new Crystallizer(config.model, apiKey);
  }

  // Confirmation gate for real AI
  if (crystallizer.isRealAI && !options.confirm) {
    console.log(chalk.yellow('This will use real AI and incur API costs.'));
    console.log(chalk.dim(`  Model: ${config.model}`));
    if (options.branch) {
      console.log(chalk.dim(`  Branch: ${options.branch}`));
    } else {
      console.log(chalk.dim('  Scope: all branches + overview'));
    }
    console.log('');
    console.log(chalk.yellow('Pass --confirm to proceed, or --dry-run to preview with MockCrystallizer.'));
    process.exit(0);
  }

  const modeLabel = isDryRun ? chalk.cyan('[DRY RUN] ') : '';
  console.log(`${modeLabel}${chalk.dim(`Crystallizer: ${crystallizer.name}`)}`);
  console.log('');

  const crystallizeOptions = {
    outputDir: options.output,
    branches: options.branch ? [options.branch] : undefined,
    skipOverview: options.skipOverview,
  };

  const result = await crystallizer.crystallize(stigRoot, crystallizeOptions);

  printResult(result, isDryRun);
}

function printResult(result: CrystallizeResult, isDryRun: boolean): void {
  for (const branch of result.branches) {
    const status = branch.error ? chalk.red('!') : chalk.green('✓');
    const costStr = branch.cost.api_calls > 0
      ? chalk.dim(` (${branch.cost.input_tokens} in / ${branch.cost.output_tokens} out)`)
      : '';
    const errStr = branch.error ? chalk.red(` [${branch.error}]`) : '';
    console.log(`  ${status} ${chalk.bold(branch.branch)} — ${branch.nodeCount} nodes${costStr}${errStr}`);
  }

  if (result.overview) {
    const status = result.overview.error ? chalk.red('!') : chalk.green('✓');
    const errStr = result.overview.error ? chalk.red(` [${result.overview.error}]`) : '';
    console.log(`  ${status} ${chalk.bold('overview')}${errStr}`);
  }

  console.log('');
  console.log(chalk.dim('─'.repeat(50)));

  if (result.totalCost.api_calls > 0) {
    console.log(
      `Cost: ${chalk.bold(String(result.totalCost.api_calls))} API calls | ` +
      `${chalk.bold(String(result.totalCost.input_tokens))} input tokens | ` +
      `${chalk.bold(String(result.totalCost.output_tokens))} output tokens`,
    );
  }

  const outputDir = result.branches[0]?.outputPath
    ? result.branches[0].outputPath.replace(/\/[^/]+$/, '')
    : 'crystals/';
  console.log(`Output: ${chalk.bold(outputDir)}`);
}

function loadConfig(stigRoot: string): WorkspaceConfig {
  const configPath = join(stigRoot, 'config.json');
  if (existsSync(configPath)) {
    try {
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (!parsed.budget) {
        parsed.budget = DEFAULT_CONFIG.budget;
      }
      return parsed as WorkspaceConfig;
    } catch {
      return DEFAULT_CONFIG;
    }
  }
  return DEFAULT_CONFIG;
}
