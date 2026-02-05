import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { scanTree } from '../tree/scanner.js';
import { listChildren } from '../tree/node.js';
import { Verifier } from '../agents/verifier.js';
import type { StigNode } from '../types.js';

export async function verifyCommand(
  stigRoot: string,
  options: { path?: string; coverage?: boolean; max?: number },
): Promise<void> {
  const workspacePath = join(stigRoot, 'workspace');

  if (!existsSync(join(workspacePath, 'root.md'))) {
    console.error(chalk.red('No workspace found. Run `stig init "your goal"` first.'));
    process.exit(1);
  }

  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    console.error(chalk.red('GEMINI_API_KEY is required for the Verifier.'));
    process.exit(1);
  }

  const nodes = scanTree(workspacePath);
  const nodeMap = new Map(nodes.map((n) => [n.path, n]));

  const verifier = new Verifier('gemini-2.5-flash-lite', apiKey);
  let totalCost = { api_calls: 0, input_tokens: 0, output_tokens: 0 };

  if (options.coverage) {
    // Coverage assessment mode - check if children cover parent scope
    await runCoverageAssessment(nodes, nodeMap, workspacePath, verifier, options, totalCost);
  } else {
    // Stability verification mode - check if nodes are implementable
    await runStabilityVerification(nodes, nodeMap, verifier, options, totalCost);
  }

  console.log('');
  console.log(chalk.dim('─'.repeat(50)));
  console.log(
    `Cost: ${totalCost.api_calls} calls, ${totalCost.input_tokens} input tokens, ${totalCost.output_tokens} output tokens`,
  );
}

async function runStabilityVerification(
  nodes: StigNode[],
  nodeMap: Map<string, StigNode>,
  verifier: Verifier,
  options: { path?: string; max?: number },
  totalCost: { api_calls: number; input_tokens: number; output_tokens: number },
): Promise<void> {
  console.log(chalk.bold('Stability Verification'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.dim('Checking: Could a developer implement this without clarifying questions?\n'));

  // Filter nodes to check
  let toVerify: StigNode[];
  if (options.path) {
    const node = nodeMap.get(options.path);
    if (!node) {
      console.error(chalk.red(`Node not found: ${options.path}`));
      process.exit(1);
    }
    toVerify = [node];
  } else {
    // Check leaf nodes with high confidence (candidates for stability)
    toVerify = nodes
      .filter((n) => {
        const children = listChildren(
          nodeMap.get('.')?.path ? join(process.cwd(), 'workspace') : process.cwd(),
          n.path,
        );
        return children.length === 0 && n.signals.confidence >= 6;
      })
      .slice(0, options.max ?? 10);
  }

  if (toVerify.length === 0) {
    console.log(chalk.yellow('No high-confidence leaf nodes found to verify.'));
    return;
  }

  console.log(`Verifying ${chalk.bold(String(toVerify.length))} nodes...\n`);

  let implementable = 0;
  let notImplementable = 0;

  for (const node of toVerify) {
    process.stdout.write(`  ${node.path} [conf:${node.signals.confidence}] ... `);

    const result = await verifier.verifyStability(node);

    totalCost.api_calls += result.cost.api_calls;
    totalCost.input_tokens += result.cost.input_tokens;
    totalCost.output_tokens += result.cost.output_tokens;

    if (result.error) {
      console.log(chalk.red(`error: ${result.error}`));
      continue;
    }

    if (result.is_implementable) {
      implementable++;
      console.log(chalk.green('implementable'));
    } else {
      notImplementable++;
      console.log(chalk.yellow('not implementable'));
      if (result.missing && result.missing.length > 0) {
        for (const missing of result.missing) {
          console.log(chalk.dim(`    - ${missing}`));
        }
      }
    }
  }

  console.log('');
  console.log(`Implementable: ${chalk.green(String(implementable))}/${toVerify.length}`);
  console.log(`Needs work: ${chalk.yellow(String(notImplementable))}/${toVerify.length}`);
}

async function runCoverageAssessment(
  nodes: StigNode[],
  nodeMap: Map<string, StigNode>,
  workspacePath: string,
  verifier: Verifier,
  options: { path?: string; max?: number },
  totalCost: { api_calls: number; input_tokens: number; output_tokens: number },
): Promise<void> {
  console.log(chalk.bold('Coverage Assessment'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.dim('Checking: Do children fully cover everything the parent requires?\n'));

  // Filter parent nodes to check
  let toAssess: StigNode[];
  if (options.path) {
    const node = nodeMap.get(options.path);
    if (!node) {
      console.error(chalk.red(`Node not found: ${options.path}`));
      process.exit(1);
    }
    toAssess = [node];
  } else {
    // Check nodes that have children
    toAssess = nodes
      .filter((n) => {
        const children = listChildren(workspacePath, n.path);
        return children.length > 0;
      })
      .slice(0, options.max ?? 10);
  }

  if (toAssess.length === 0) {
    console.log(chalk.yellow('No parent nodes found to assess.'));
    return;
  }

  console.log(`Assessing ${chalk.bold(String(toAssess.length))} parent nodes...\n`);

  let covered = 0;
  let notCovered = 0;

  for (const parent of toAssess) {
    const childPaths = listChildren(workspacePath, parent.path);
    const children = childPaths.map((p) => nodeMap.get(p)).filter((n): n is StigNode => n !== undefined);

    process.stdout.write(`  ${parent.path} [${children.length} children] ... `);

    const result = await verifier.assessCoverage(parent, children);

    totalCost.api_calls += result.cost.api_calls;
    totalCost.input_tokens += result.cost.input_tokens;
    totalCost.output_tokens += result.cost.output_tokens;

    if (result.error) {
      console.log(chalk.red(`error: ${result.error}`));
      continue;
    }

    if (result.is_covered) {
      covered++;
      console.log(chalk.green('fully covered'));
    } else {
      notCovered++;
      console.log(chalk.yellow('gaps found'));
      if (result.gaps && result.gaps.length > 0) {
        for (const gap of result.gaps) {
          console.log(chalk.dim(`    - ${gap}`));
        }
      }
    }
  }

  console.log('');
  console.log(`Fully covered: ${chalk.green(String(covered))}/${toAssess.length}`);
  console.log(`Has gaps: ${chalk.yellow(String(notCovered))}/${toAssess.length}`);
}
