import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { run } from '../simulation/pulse.js';
import { MockSpore } from '../agents/mock-spore.js';
import { FlashSpore } from '../agents/flash-spore.js';
import type { Agent } from '../agents/agent.js';
import { DEFAULT_CONFIG } from '../types.js';
import type { WorkspaceConfig } from '../types.js';
import type { RunResult } from '../simulation/pulse.js';

export async function runCommand(
  stigRoot: string,
  options: { maxPulses?: number; dryRun?: boolean; confirm?: boolean; parallel?: number },
): Promise<void> {
  const workspacePath = join(stigRoot, 'workspace');

  if (!existsSync(join(workspacePath, 'root.md'))) {
    console.error(chalk.red('No workspace found. Run `hierophage stig init "your goal"` first.'));
    process.exit(1);
  }

  const config = { ...loadConfig(stigRoot), budget: { ...loadConfig(stigRoot).budget } };
  if (options.maxPulses !== undefined) {
    config.max_pulses = options.maxPulses;
  }
  if (options.parallel !== undefined) {
    config.max_concurrent_workers = options.parallel;
  }

  // Agent selection: dry-run uses MockSpore, otherwise FlashSpore
  const isDryRun = options.dryRun ?? false;
  let agent: Agent;

  if (isDryRun) {
    agent = new MockSpore();
  } else {
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) {
      console.error(chalk.red('GEMINI_API_KEY is required for real AI runs.'));
      console.error(chalk.dim('  Set it: export GEMINI_API_KEY=your-key'));
      console.error(chalk.dim('  Or use: stig run --dry-run'));
      process.exit(1);
    }
    agent = new FlashSpore(config.model, apiKey);
  }

  // Confirmation gate: real AI agents require --confirm
  if (agent.isRealAI && !options.confirm) {
    console.log(chalk.yellow('This run will use real AI and incur API costs.'));
    console.log(chalk.dim(`  Model: ${config.model}`));
    console.log(chalk.dim(`  Budget: ${config.budget.max_api_calls} API calls, ${config.budget.max_input_tokens} input tokens`));
    console.log(chalk.dim(`  Max pulses: ${config.max_pulses}`));
    console.log('');
    console.log(chalk.yellow('Pass --confirm to proceed, or --dry-run to preview with MockSpore.'));
    process.exit(0);
  }

  const modeLabel = isDryRun ? chalk.cyan('[DRY RUN] ') : '';
  const parallelLabel = config.max_concurrent_workers > 1 ? ` | parallel: ${config.max_concurrent_workers}` : '';
  console.log(
    `${modeLabel}${chalk.dim(`Agent: ${agent.name} | max pulses: ${config.max_pulses}${parallelLabel} | ` +
    `budget: ${config.budget.max_api_calls} calls, ${(config.budget.max_input_tokens / 1000).toFixed(0)}k tokens`)}`,
  );
  console.log('');

  const result = await run(stigRoot, agent, config);

  printResult(result, config);
}

function printResult(result: RunResult, config: WorkspaceConfig): void {
  // Print pulse log
  for (const p of result.pulses) {
    const status = p.errors.length > 0 ? chalk.red('!') : chalk.green('✓');
    const overheated = p.skipped_overheated > 0
      ? chalk.yellow(` [${p.skipped_overheated} overheated]`)
      : '';
    const costStr = p.cost.api_calls > 0
      ? chalk.dim(` (${p.cost.api_calls} calls, ${p.cost.input_tokens} tokens)`)
      : chalk.dim(`(${p.mutations_succeeded} mutations)`);
    const agentErr = p.agent_error ? chalk.red(` [${p.agent_error}]`) : '';
    console.log(`  ${status} Pulse ${p.pulse_number}: ${chalk.bold(p.target_name)} ${costStr}${overheated}${agentErr}`);
  }

  console.log('');
  console.log(chalk.dim('─'.repeat(50)));

  // Termination reason
  const reasonLabels: Record<string, string> = {
    stable: chalk.green('Tree reached stability'),
    max_pulses: chalk.yellow(`Max pulses reached (${config.max_pulses})`),
    no_target: chalk.yellow('No target found'),
    budget_exceeded: chalk.red(`Budget exceeded: ${result.termination_detail}`),
  };

  console.log(`Result: ${reasonLabels[result.terminated_reason]}`);
  console.log(`Pulses: ${chalk.bold(String(result.total_pulses))}`);

  // Budget summary
  const b = result.budget;
  if (b.total_api_calls > 0) {
    console.log(
      `Cost: ${chalk.bold(String(b.total_api_calls))} API calls | ` +
      `${chalk.bold(String(b.total_input_tokens))} input tokens | ` +
      `${chalk.bold(String(b.total_output_tokens))} output tokens`,
    );
  }

  const s = result.final_stats;
  const maintenanceStats: string[] = [];
  if (result.pruned_nodes > 0) maintenanceStats.push(`${chalk.magenta(String(result.pruned_nodes))} pruned`);
  if (result.scout_fixes > 0) maintenanceStats.push(`${chalk.yellow(String(result.scout_fixes))} scout fixes`);
  if (result.propagations > 0) maintenanceStats.push(`${chalk.cyan(String(result.propagations))} propagations`);
  if (result.resolver_attempts > 0) {
    maintenanceStats.push(`${chalk.blue(String(result.resolver_resolutions))}/${result.resolver_attempts} resolved`);
  }
  if (result.weaver_overlaps > 0) maintenanceStats.push(`${chalk.hex('#FFA500')(String(result.weaver_overlaps))} overlaps`);
  if (result.synthesis_merges > 0) maintenanceStats.push(`${chalk.hex('#9B59B6')(String(result.synthesis_merges))} synthesized`);
  const maintenanceStr = maintenanceStats.length > 0 ? ` | ${maintenanceStats.join(', ')}` : '';

  // Verification stats
  const verifyStats: string[] = [];
  if (result.stability_checks > 0) {
    const passed = result.stability_checks - result.stability_failures;
    verifyStats.push(`stability ${chalk.green(String(passed))}/${result.stability_checks}`);
  }
  if (result.coverage_checks > 0) {
    const passed = result.coverage_checks - result.coverage_failures;
    verifyStats.push(`coverage ${chalk.green(String(passed))}/${result.coverage_checks}`);
  }
  const verifyStr = verifyStats.length > 0 ? `\nVerification: ${verifyStats.join(' | ')}` : '';

  console.log(
    `Nodes: ${chalk.bold(String(s.total_nodes))} | ` +
    `avg confidence: ${chalk.bold(String(s.avg_confidence))} | ` +
    `${chalk.green(String(s.stable_count))} stable | ` +
    `${chalk.red(String(s.nodes_in_conflict))} conflict${maintenanceStr}${verifyStr}`,
  );
}

function loadConfig(stigRoot: string): WorkspaceConfig {
  const configPath = join(stigRoot, 'config.json');
  if (existsSync(configPath)) {
    try {
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
      // Ensure budget field exists (backwards compatibility with Phase 0 configs)
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
