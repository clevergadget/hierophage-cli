import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { DEFAULT_CONFIG, SCAFFOLD_SIGNALS, DEFAULT_EVIDENCE } from '../types.js';
import { MutationDispatcher } from '../dispatch/dispatcher.js';
import { createMutation } from '../dispatch/mutations.js';
import { writeNode } from '../tree/node.js';
import { GoalAnalyst } from '../agents/goal-analyst.js';
import type { StigNode } from '../types.js';

const STATIC_SCAFFOLDS: Array<{ name: string; content: string }> = [
  { name: 'user-flows', content: 'How people actually use this. The journeys, interactions, and workflows that define the experience.' },
  { name: 'architecture', content: 'The structural decisions. How components connect, where data lives, what patterns hold it together.' },
  { name: 'testing', content: 'Proving it works. Unit tests, integration tests, edge cases, and the confidence they provide.' },
  { name: 'deployment', content: 'Getting it to users. Build pipelines, distribution channels, release processes, and infrastructure.' },
  { name: 'error-handling', content: 'What happens when things go wrong. Validation, recovery, user feedback, and graceful degradation.' },
];

export interface InitOptions {
  scaffold?: boolean;
  analyze?: boolean;
  context?: string[]; // Implementation constraints like "TypeScript", "React", "Node.js"
}

export async function initCommand(goal: string, stigRoot: string, options: InitOptions): Promise<void> {
  if (existsSync(join(stigRoot, 'workspace', 'root.md'))) {
    console.error(chalk.red('Workspace already initialized. Delete .hierophage/stig/ to start over.'));
    process.exit(1);
  }

  // Create directory structure
  const workspacePath = join(stigRoot, 'workspace');
  mkdirSync(workspacePath, { recursive: true });

  // Write config
  writeFileSync(join(stigRoot, 'config.json'), JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');

  // Initialize mutations log
  writeFileSync(join(stigRoot, 'mutations.log'), '', 'utf-8');

  // Build root content with optional implementation context
  let rootContent = `# Goal\n\n${goal}`;

  if (options.context && options.context.length > 0) {
    rootContent += `\n\n# Given Context\n\nThe following implementation decisions are already made:\n`;
    for (const constraint of options.context) {
      rootContent += `- ${constraint}\n`;
    }
    rootContent += `\nDo not spec alternatives to these — they are settled.`;
  }

  rootContent += `\n\n# Foundation\n\nSee ${DEFAULT_CONFIG.foundation_path} for constitutional authority.`;

  // Write root node directly (before dispatcher exists)
  const rootNode: StigNode = {
    path: '.',
    name: 'root',
    signals: {
      need: 10,
      confidence: 0,
      conflict: 0,
      workers_active: 0,
      last_pulse: new Date().toISOString(),
    },
    evidence: { ...DEFAULT_EVIDENCE },
    content: rootContent,
    isScaffold: false,
  };
  writeNode(workspacePath, '.', rootNode);

  console.log(chalk.green('Workspace initialized.'));
  console.log(`  Root: ${chalk.bold(goal)}`);

  // Determine scaffolds: analyze with LLM or use static list
  if (options.scaffold !== false) {
    const dispatcher = new MutationDispatcher(stigRoot);

    if (options.analyze) {
      // LLM-powered goal analysis
      const apiKey = process.env['GEMINI_API_KEY'];
      if (!apiKey) {
        console.error(chalk.yellow('  GEMINI_API_KEY not set, falling back to static scaffolds.'));
        createStaticScaffolds(dispatcher);
      } else {
        await analyzeAndCreateScaffolds(goal, dispatcher, apiKey);
      }
    } else {
      // Use static scaffolds (legacy behavior)
      createStaticScaffolds(dispatcher);
    }
  }

  console.log('');
  console.log(chalk.dim('Run `stig status` to see the tree.'));
}

function createStaticScaffolds(dispatcher: MutationDispatcher): void {
  for (const scaffold of STATIC_SCAFFOLDS) {
    const mutation = createMutation('CREATE_NODE', scaffold.name, {
      name: scaffold.name,
      signals: { ...SCAFFOLD_SIGNALS, last_pulse: new Date().toISOString() },
      isScaffold: true,
      content: scaffold.content,
    });
    const result = dispatcher.dispatch(mutation);
    if (result.success) {
      console.log(`  Scaffold: ${chalk.dim(scaffold.name)}`);
    } else {
      console.error(chalk.red(`  Failed to create scaffold ${scaffold.name}: ${result.error}`));
    }
  }
}

async function analyzeAndCreateScaffolds(
  goal: string,
  dispatcher: MutationDispatcher,
  apiKey: string,
): Promise<void> {
  console.log(chalk.dim('  Analyzing goal...'));

  const analyst = new GoalAnalyst('gemini-2.5-flash-lite', apiKey);
  const analysis = await analyst.analyze(goal);

  if (analysis.error) {
    console.error(chalk.yellow(`  Analysis failed: ${analysis.error}`));
    console.log(chalk.dim('  Falling back to static scaffolds.'));
    createStaticScaffolds(dispatcher);
    return;
  }

  console.log(chalk.dim(`  ${analysis.reasoning}`));

  if (analysis.concerns.length === 0) {
    console.log(chalk.green('  No special concerns identified. Starting with clean slate.'));
    return;
  }

  console.log(`  Found ${chalk.bold(String(analysis.concerns.length))} special concern(s):`);

  for (const concern of analysis.concerns) {
    const mutation = createMutation('CREATE_NODE', concern.name, {
      name: concern.name,
      signals: { ...SCAFFOLD_SIGNALS, last_pulse: new Date().toISOString() },
      isScaffold: true,
      content: concern.description,
    });
    const result = dispatcher.dispatch(mutation);
    if (result.success) {
      console.log(`  Concern: ${chalk.cyan(concern.name)} — ${chalk.dim(concern.description)}`);
    } else {
      console.error(chalk.red(`  Failed to create concern ${concern.name}: ${result.error}`));
    }
  }

  console.log(chalk.dim(`  (${analysis.cost.input_tokens + analysis.cost.output_tokens} tokens)`));
}
