#!/usr/bin/env node
/**
 * hierophage prompts sync
 *
 * LLM-assisted semantic merge of upstream prompts with user preferences.
 * Creates a PR for review instead of writing directly.
 *
 * Usage:
 *   hierophage prompts sync --profile kawazu
 *   hierophage prompts sync --profile kawazu --dry-run
 */

import { spawn, execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const REPO_ROOT = join(__dirname, '../..');
const UPSTREAM_PROMPTS = join(REPO_ROOT, 'packages/core/src/core/prompts.ts');
const GEMINI_BINARY = join(REPO_ROOT, 'bundle/hierophage.js');
const PROFILES_DIR = join(REPO_ROOT, '.hierophage/profiles');

/**
 * Parse command line arguments
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    profile: null,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--profile' || arg === '-p') {
      result.profile = args[++i];
    } else if (arg.startsWith('--profile=')) {
      result.profile = arg.slice('--profile='.length);
    } else if (arg === '--dry-run' || arg === '-n') {
      result.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    }
  }

  return result;
}

/**
 * Show usage help
 */
function showHelp() {
  console.log(`
hierophage prompts sync - Semantic merge of upstream prompts with user preferences

Usage:
  hierophage prompts sync --profile <name> [options]

Options:
  --profile, -p <name>  Profile to sync (required)
  --dry-run, -n         Show generated content without creating PR
  --help, -h            Show this help

Example:
  hierophage prompts sync --profile kawazu
  hierophage prompts sync --profile kawazu --dry-run

The command:
  1. Reads upstream prompts from packages/core/src/core/prompts.ts
  2. Reads preferences from .hierophage/profiles/<name>/preferences.md
  3. Uses LLM to generate merged system.md
  4. Creates a PR with the changes for review
`);
}

/**
 * Read file or return null
 */
function readFile(path) {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Run a shell command and return output
 */
function run(cmd, options = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', cwd: REPO_ROOT, ...options }).trim();
  } catch (error) {
    if (options.throws !== false) {
      throw error;
    }
    return null;
  }
}

/**
 * Call gemini CLI to perform the merge
 */
async function callLLM(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [GEMINI_BINARY, '-p', prompt], {
      env: { ...process.env },
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`LLM call failed (exit ${code}): ${stderr}`));
      }
    });

    child.on('error', reject);
  });
}

/**
 * Build the merge prompt
 */
function buildMergePrompt(upstreamPrompts, preferences, currentSystemMd) {
  return `You are helping merge upstream prompt changes with user preferences.

## Task
Generate a complete system.md file that:
1. Incorporates the latest upstream prompt structure and improvements
2. Applies the user's stated preferences
3. Resolves conflicts in favor of user preferences (except for safety/security)

## Upstream Prompts (current vanilla gemini-cli prompts.ts)

The following is the TypeScript file that generates the default system prompt.
Extract the relevant prompt text and structure from it.

\`\`\`typescript
${upstreamPrompts}
\`\`\`

## User Preferences

The following describes how this user wants their prompt to differ from vanilla:

${preferences}

## Current system.md (if any, for reference)

${currentSystemMd || '(none - generating fresh)'}

## Output Instructions

Output ONLY the final system.md content:
- No code fences
- No explanations or preamble
- Just the complete, ready-to-use system prompt markdown
- Include all sections (Core Mandates, Primary Workflows, Operational Guidelines, etc.)
- Apply the user's preferences throughout

Generate the system.md now:`;
}

/**
 * Get current git user from gh
 */
function getGitHubUser() {
  try {
    const status = run('gh auth status 2>&1', { throws: false });
    const match = status?.match(/Logged in to github\.com account (\w+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Create branch, commit, push, and create PR
 */
function createPR(profile, systemMdPath, newContent, currentContent) {
  const timestamp = new Date().toISOString().slice(0, 10);
  const branchName = `prompts-sync/${profile}-${timestamp}`;
  const currentBranch = run('git rev-parse --abbrev-ref HEAD');

  console.log(`\nCreating PR for ${profile} profile sync...`);

  // Check for uncommitted changes
  const status = run('git status --porcelain');
  if (status) {
    console.error('Error: You have uncommitted changes. Please commit or stash them first.');
    process.exit(1);
  }

  try {
    // Create and switch to new branch
    console.log(`  Creating branch: ${branchName}`);
    run(`git checkout -b ${branchName}`);

    // Write the new content
    writeFileSync(systemMdPath, newContent);

    // Stage and commit
    const relativePath = systemMdPath.replace(REPO_ROOT + '/', '');
    run(`git add "${relativePath}"`);

    const commitMsg = `Sync ${profile} profile prompts with upstream

Regenerated system.md by applying ${profile}/preferences.md to current upstream prompts.ts.

This is an automated sync - please review the changes carefully.`;

    run(`git commit -m "${commitMsg}"`);

    // Push
    console.log('  Pushing branch...');
    run(`git push -u origin ${branchName}`);

    // Create PR
    console.log('  Creating PR...');
    const prBody = `## Prompts Sync: ${profile}

This PR updates the \`${profile}\` profile's system.md by applying its preferences to the current upstream prompts.

### What changed
- Regenerated \`system.md\` from current \`prompts.ts\` + \`preferences.md\`

### Review checklist
- [ ] Preferences are correctly applied
- [ ] No upstream improvements were incorrectly excluded
- [ ] Safety/security guidance is preserved

---
*Generated by \`hierophage prompts sync\`*`;

    const prUrl = run(`gh pr create --title "Sync ${profile} profile prompts" --body "${prBody.replace(/"/g, '\\"')}" --assignee @me`);

    console.log(`\n  PR created: ${prUrl}`);

    // Switch back to original branch
    run(`git checkout ${currentBranch}`);

    return prUrl;

  } catch (error) {
    // Try to recover - switch back to original branch
    try {
      run(`git checkout ${currentBranch}`, { throws: false });
    } catch {}

    throw error;
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (!args.profile) {
    console.error('Error: --profile is required');
    showHelp();
    process.exit(1);
  }

  const profileDir = join(PROFILES_DIR, args.profile);
  const preferencesPath = join(profileDir, 'preferences.md');
  const systemMdPath = join(profileDir, 'system.md');

  // Check prerequisites
  if (!existsSync(profileDir)) {
    console.error(`Error: Profile directory not found: ${profileDir}`);
    process.exit(1);
  }

  if (!existsSync(preferencesPath)) {
    console.error(`Error: Preferences file not found: ${preferencesPath}`);
    console.error('Create a preferences.md file describing your customizations.');
    process.exit(1);
  }

  if (!existsSync(UPSTREAM_PROMPTS)) {
    console.error(`Error: Upstream prompts not found: ${UPSTREAM_PROMPTS}`);
    process.exit(1);
  }

  // Check gh is available
  if (!args.dryRun) {
    const ghUser = getGitHubUser();
    if (!ghUser) {
      console.error('Error: GitHub CLI not authenticated. Run: gh auth login');
      process.exit(1);
    }
    console.log(`GitHub user: ${ghUser}`);
  }

  console.log(`Syncing profile: ${args.profile}`);
  console.log(`  Preferences: ${preferencesPath}`);
  console.log(`  Output: ${systemMdPath}`);

  // Read inputs
  const upstreamPrompts = readFile(UPSTREAM_PROMPTS);
  const preferences = readFile(preferencesPath);
  const currentSystemMd = readFile(systemMdPath);

  if (!upstreamPrompts) {
    console.error('Error: Could not read upstream prompts');
    process.exit(1);
  }

  if (!preferences) {
    console.error('Error: Could not read preferences');
    process.exit(1);
  }

  // Build merge prompt
  const mergePrompt = buildMergePrompt(upstreamPrompts, preferences, currentSystemMd);

  console.log('\nCalling LLM to generate merged system.md...');

  try {
    const newSystemMd = await callLLM(mergePrompt);

    if (!newSystemMd || newSystemMd.length < 100) {
      console.error('Error: LLM returned empty or too short response');
      console.error('Response was:', newSystemMd);
      process.exit(1);
    }

    console.log(`\nGenerated ${newSystemMd.length} characters`);

    if (args.dryRun) {
      console.log('\n--- Generated system.md ---\n');
      console.log(newSystemMd);
      console.log('\n--- End ---');
      console.log('\n(dry run - no PR created)');
      process.exit(0);
    }

    // Create PR
    const prUrl = createPR(args.profile, systemMdPath, newSystemMd, currentSystemMd);

    console.log('\nDone! Review and merge the PR to apply changes.');
    console.log('After merging, run: npm run hierophage:install');

  } catch (error) {
    console.error('Error during sync:', error.message);
    process.exit(1);
  }
}

main();
