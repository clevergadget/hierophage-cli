#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initCommand } from './init.js';
import { statusCommand } from './status.js';
import { showCommand } from './show.js';
import { addCommand } from './add.js';
import { setCommand } from './set.js';
import { pulseCommand } from './pulse-cmd.js';
import { runCommand } from './run-cmd.js';
import { vizCommand } from './viz.js';
import { crystallizeCommand } from './crystallize-cmd.js';
import { scoutCommand } from './scout-cmd.js';
import { grazerCommand } from './grazer-cmd.js';
import { resolverCommand } from './resolver-cmd.js';
import { verifyCommand } from './verify-cmd.js';
import { synthesizeCommand } from './synthesize-cmd.js';
import { weaveCommand } from './weave-cmd.js';
import { replayCommand } from './replay-cmd.js';

// Load .env.local from package root if it exists (overrides shell env)
// CLI runs from dist/src/cli/, so go up 3 levels to reach package root
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '..', '..', '.env.local');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
    // Always use .env.local values - they take precedence over shell env
    process.env[key] = value;
  }
}

const DEFAULT_STIG_ROOT = join(homedir(), '.hierophage', 'stig');

// Resolve workspace path from --workspace flag or default
function getStigRoot(argv: { workspace?: string }): string {
  return argv.workspace ?? DEFAULT_STIG_ROOT;
}

yargs(hideBin(process.argv))
  .scriptName('stig')
  .usage('$0 <command> [options]')
  .option('workspace', {
    type: 'string',
    describe: 'Workspace directory (default: ~/.hierophage/stig)',
    global: true,
  })
  .command(
    'init <goal>',
    'Initialize a new stigmergy workspace',
    (y) =>
      y
        .positional('goal', {
          type: 'string',
          describe: 'The goal for this workspace',
          demandOption: true,
        })
        .option('skip-scaffolds', {
          type: 'boolean',
          describe: 'Skip creating scaffold nodes',
          default: false,
        })
        .option('analyze', {
          type: 'boolean',
          describe: 'Use LLM to identify goal-specific concerns (default: true)',
          default: true,
        })
        .option('static-scaffolds', {
          type: 'boolean',
          describe: 'Use static scaffolds instead of LLM analysis',
          default: false,
        })
        .option('context', {
          type: 'array',
          alias: 'c',
          describe: 'Implementation constraints (defaults: TypeScript, React, Node.js)',
          default: ['TypeScript', 'React', 'Node.js'],
        })
        .option('no-context', {
          type: 'boolean',
          describe: 'Clear default constraints (explore all tech stacks)',
          default: false,
        }),
    async (argv) => {
      await initCommand(argv.goal as string, getStigRoot(argv), {
        scaffold: !argv['skip-scaffolds'],
        analyze: argv['static-scaffolds'] ? false : (argv.analyze as boolean),
        context: argv['no-context'] ? [] : (argv.context as string[]),
      });
    },
  )
  .command(
    'status',
    'Show tree status with signal indicators',
    () => {},
    (argv) => {
      statusCommand(getStigRoot(argv));
    },
  )
  .command(
    'show <path>',
    'Show a node with its context chain',
    (y) =>
      y.positional('path', {
        type: 'string',
        describe: 'Path to the node (e.g., "platform/target-os")',
        demandOption: true,
      }),
    (argv) => {
      showCommand(getStigRoot(argv), argv.path as string);
    },
  )
  .command(
    'add <parent> <name>',
    'Add a child node under a parent',
    (y) =>
      y
        .positional('parent', {
          type: 'string',
          describe: 'Parent node path (use "." for root)',
          demandOption: true,
        })
        .positional('name', {
          type: 'string',
          describe: 'Name for the new node',
          demandOption: true,
        })
        .option('scaffold', {
          type: 'boolean',
          describe: 'Create as a scaffold node (higher initial need)',
          default: false,
        }),
    (argv) => {
      addCommand(getStigRoot(argv), argv.parent as string, argv.name as string, {
        scaffold: argv.scaffold,
      });
    },
  )
  .command(
    'set <path> <signal> <value>',
    'Set a signal value on a node',
    (y) =>
      y
        .positional('path', {
          type: 'string',
          describe: 'Node path',
          demandOption: true,
        })
        .positional('signal', {
          type: 'string',
          describe: 'Signal name (need, confidence, conflict, workers_active)',
          demandOption: true,
        })
        .positional('value', {
          type: 'string',
          describe: 'Signal value (0-10)',
          demandOption: true,
        }),
    (argv) => {
      setCommand(getStigRoot(argv), argv.path as string, argv.signal as string, argv.value as string);
    },
  )
  .command(
    'pulse',
    'Run one simulation pulse (scan → select → act)',
    () => {},
    async (argv) => {
      await pulseCommand(getStigRoot(argv));
    },
  )
  .command(
    'run',
    'Run simulation until stability or max pulses',
    (y) =>
      y
        .option('max-pulses', {
          type: 'number',
          describe: 'Maximum number of pulses (overrides config)',
        })
        .option('dry-run', {
          type: 'boolean',
          describe: 'Use MockSpore instead of real AI (no API cost)',
          default: false,
        })
        .option('confirm', {
          type: 'boolean',
          describe: 'Confirm real AI run (required when using real AI agents)',
          default: false,
        })
        .option('parallel', {
          type: 'number',
          describe: 'Number of parallel agents (default: 8)',
        }),
    async (argv) => {
      await runCommand(getStigRoot(argv), {
        maxPulses: argv['max-pulses'] as number | undefined,
        dryRun: argv['dry-run'] as boolean,
        confirm: argv.confirm as boolean,
        parallel: argv.parallel as number | undefined,
      });
    },
  )
  .command(
    'viz',
    'Open tree visualization in browser',
    () => {},
    (argv) => {
      vizCommand(getStigRoot(argv));
    },
  )
  .command(
    'crystallize',
    'Produce specification documents from the tree',
    (y) =>
      y
        .option('branch', {
          type: 'string',
          describe: 'Crystallize only this branch',
        })
        .option('output', {
          type: 'string',
          describe: 'Output directory (default: {stigRoot}/crystals/)',
        })
        .option('dry-run', {
          type: 'boolean',
          describe: 'Use MockCrystallizer (no API cost)',
          default: false,
        })
        .option('confirm', {
          type: 'boolean',
          describe: 'Confirm real AI crystallization',
          default: false,
        })
        .option('skip-overview', {
          type: 'boolean',
          describe: 'Skip generating the overview document',
          default: false,
        }),
    async (argv) => {
      await crystallizeCommand(getStigRoot(argv), {
        branch: argv.branch as string | undefined,
        output: argv.output as string | undefined,
        dryRun: argv['dry-run'] as boolean,
        confirm: argv.confirm as boolean,
        skipOverview: argv['skip-overview'] as boolean,
      });
    },
  )
  .command(
    'scout',
    'Patrol tree for problems (hollow nodes, tautologies, duplicates)',
    (y) =>
      y.option('fix', {
        type: 'boolean',
        describe: 'Apply conflict signals to problematic nodes',
        default: false,
      }),
    async (argv) => {
      await scoutCommand(getStigRoot(argv), {
        fix: argv.fix as boolean,
      });
    },
  )
  .command(
    'grazer',
    'Patrol tree for dead nodes (necrophoresis)',
    (y) =>
      y.option('prune', {
        type: 'boolean',
        describe: 'Delete dead nodes (irreversible)',
        default: false,
      }),
    async (argv) => {
      await grazerCommand(getStigRoot(argv), {
        prune: argv.prune as boolean,
      });
    },
  )
  .command(
    'resolve',
    'Resolve conflicts using LLM (targets high-conflict nodes)',
    (y) =>
      y
        .option('max', {
          type: 'number',
          describe: 'Maximum nodes to resolve',
          default: 10,
        })
        .option('apply', {
          type: 'boolean',
          describe: 'Apply the resolutions to the tree',
          default: false,
        }),
    async (argv) => {
      await resolverCommand(getStigRoot(argv), {
        max: argv.max as number,
        apply: argv.apply as boolean,
      });
    },
  )
  .command(
    'verify',
    'Verify node quality using LLM (stability or coverage)',
    (y) =>
      y
        .option('path', {
          type: 'string',
          describe: 'Specific node path to verify',
        })
        .option('coverage', {
          type: 'boolean',
          describe: 'Check coverage (do children cover parent?) instead of stability',
          default: false,
        })
        .option('max', {
          type: 'number',
          describe: 'Maximum nodes to verify',
          default: 10,
        }),
    async (argv) => {
      await verifyCommand(getStigRoot(argv), {
        path: argv.path as string | undefined,
        coverage: argv.coverage as boolean,
        max: argv.max as number,
      });
    },
  )
  .command(
    'synthesize',
    'Synthesize semantic duplicates into unified nodes',
    (y) =>
      y
        .option('dry-run', {
          type: 'boolean',
          describe: 'Preview without applying changes',
          default: false,
        })
        .option('confirm', {
          type: 'boolean',
          describe: 'Confirm real synthesis',
          default: false,
        })
        .option('max-groups', {
          type: 'number',
          describe: 'Maximum sibling groups to analyze',
          default: 10,
        }),
    async (argv) => {
      await synthesizeCommand(getStigRoot(argv), {
        dryRun: argv['dry-run'] as boolean,
        confirm: argv.confirm as boolean,
        maxGroups: argv['max-groups'] as number,
      });
    },
  )
  .command(
    'weave',
    'Find cross-branch semantic overlaps',
    (y) =>
      y.option('apply', {
        type: 'boolean',
        describe: 'Apply conflict signals to overlapping nodes',
        default: false,
      }),
    async (argv) => {
      await weaveCommand(getStigRoot(argv), {
        apply: argv.apply as boolean,
      });
    },
  )
  .command(
    'replay',
    'Replay a run from telemetry (timeline, node history, maintenance)',
    (y) =>
      y
        .option('node', {
          type: 'string',
          describe: 'Show history for a specific node path',
        })
        .option('pulse', {
          type: 'number',
          describe: 'Show detail for a specific pulse number',
        })
        .option('maintenance', {
          type: 'boolean',
          describe: 'Show only maintenance/ecology events',
          default: false,
        })
        .option('agent', {
          type: 'string',
          describe: 'Filter events by agent name',
        }),
    (argv) => {
      replayCommand(getStigRoot(argv), {
        node: argv.node as string | undefined,
        pulse: argv.pulse as number | undefined,
        maintenance: argv.maintenance as boolean,
        agent: argv.agent as string | undefined,
      });
    },
  )
  .demandCommand(1, 'You need at least one command')
  .strict()
  .help()
  .parse();
