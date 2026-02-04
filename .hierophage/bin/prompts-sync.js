#!/usr/bin/env node
/**
 * hierophage prompts sync
 *
 * Merges upstream prompt changes with user customizations.
 * Preserves exact wording where specified in preferences.md.
 *
 * Usage:
 *   hierophage prompts sync --profile kawazu
 *   hierophage prompts sync --profile kawazu --dry-run
 */

import { spawn, execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { homedir, tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const REPO_ROOT = join(__dirname, '../..');
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
    skipExtract: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--profile' || arg === '-p') {
      result.profile = args[++i];
    } else if (arg.startsWith('--profile=')) {
      result.profile = arg.slice('--profile='.length);
    } else if (arg === '--dry-run' || arg === '-n') {
      result.dryRun = true;
    } else if (arg === '--skip-extract') {
      result.skipExtract = true;
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
hierophage prompts sync - Merge upstream prompts with user customizations

Usage:
  hierophage prompts sync --profile <name> [options]

Options:
  --profile, -p <name>  Profile to sync (required)
  --dry-run, -n         Show generated content without creating PR
  --skip-extract        Use cached vanilla instead of extracting fresh
  --help, -h            Show this help

The command:
  1. Extracts current vanilla prompt from gemini-cli
  2. Reads your preferences.md (with exact text to preserve)
  3. Reads your current system.md
  4. Uses LLM to merge, preserving your exact wording
  5. Creates a PR with the changes
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
 * Extract vanilla prompt by running gemini-cli with GEMINI_WRITE_SYSTEM_MD
 */
async function extractVanilla() {
  const tempFile = join(tmpdir(), `hierophage-vanilla-${Date.now()}.md`);

  console.log('Extracting vanilla prompt from gemini-cli...');
  console.log('(This makes a minimal API call to trigger prompt generation)\n');

  return new Promise((resolve, reject) => {
    const child = spawn('node', [GEMINI_BINARY, '-p', 'Say only: OK'], {
      env: {
        ...process.env,
        GEMINI_WRITE_SYSTEM_MD: tempFile,
        // Ensure no profile overrides
        GEMINI_SYSTEM_MD: undefined,
        HIEROPHAGE_PROFILE: undefined,
      },
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (existsSync(tempFile)) {
        try {
          const content = readFileSync(tempFile, 'utf-8');
          unlinkSync(tempFile);
          resolve(content);
        } catch (error) {
          reject(new Error(`Failed to read extracted prompt: ${error.message}`));
        }
      } else {
        reject(new Error(`Vanilla extraction failed. Check authentication.\n${stderr}`));
      }
    });

    child.on('error', reject);
  });
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
 * Build the merge prompt - this is the critical part
 */
function buildMergePrompt(vanillaPrompt, currentUserPrompt, preferences) {
  return `You are helping merge upstream prompt changes with a user's customizations.

## Your Task

Generate a new system.md that:
1. Uses the NEW VANILLA PROMPT as the structural base
2. Applies the user's EXACT TEXT where specified (copy verbatim, do not paraphrase)
3. Applies semantic preferences for sections not explicitly specified
4. Removes sections the user has marked for removal

## CRITICAL: Exact Text Preservation

The user's preferences.md contains sections marked "Exact Text to Preserve" with text in code blocks.
You MUST use this text EXACTLY as written - same words, same punctuation, same formatting.
Do NOT paraphrase, reword, or "improve" this text. Copy it character-for-character.

## Example (Fictional)

To illustrate the merge process:

**Vanilla prompt excerpt:**
\`\`\`
# Preamble
You are an AI assistant designed to help with coding tasks.

# Guidelines
- **Proactiveness:** Take initiative to solve problems completely.
- **Comments:** Add comments where helpful.
\`\`\`

**User's preferences.md excerpt:**
\`\`\`
## Exact Text to Preserve
### Preamble
\\\`\\\`\\\`
You are a thoughtful coding partner who explains before acting.
\\\`\\\`\\\`

### Comments Policy
\\\`\\\`\\\`
- **Comments:** Focus on *why*, not *what*. Never use comments to talk to the user.
\\\`\\\`\\\`

## Structural Changes
### Remove "Proactiveness" bullet
Remove the proactiveness guideline entirely.
\`\`\`

**Expected merged output:**
\`\`\`
# Preamble
You are a thoughtful coding partner who explains before acting.

# Guidelines
- **Comments:** Focus on *why*, not *what*. Never use comments to talk to the user.
\`\`\`

Notice: The preamble and comments text are copied EXACTLY from preferences (not paraphrased), and "Proactiveness" is removed entirely.

---

## Input 1: NEW VANILLA PROMPT (upstream baseline)

This is what the current gemini-cli generates. Use this as your structural template.

<vanilla_prompt>
${vanillaPrompt}
</vanilla_prompt>

## Input 2: USER'S CURRENT PROMPT (what they have now)

This shows how the user has customized things. Preserve their customizations.

<current_user_prompt>
${currentUserPrompt || '(No current prompt - generating fresh from preferences)'}
</current_user_prompt>

## Input 3: USER'S PREFERENCES

This defines what to change and what exact text to use.

<preferences>
${preferences}
</preferences>

## Output Instructions

Generate ONLY the final system.md content:
- No code fences around the output
- No explanations or commentary
- Just the complete system prompt, ready to use

The output should be a complete system prompt that:
- Has the structure of the vanilla prompt (sections, ordering)
- Uses the user's EXACT TEXT where they've specified it
- Removes sections they've marked for removal
- Incorporates their semantic preferences
- Keeps all safety/security content from vanilla

Generate the merged system.md now:`;
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
function createPR(profile, systemMdPath, newContent) {
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

Merged upstream prompt changes while preserving user customizations.
Exact text from preferences.md was preserved verbatim.

This is an automated sync - please review carefully.`;

    run(`git commit -m "${commitMsg}"`);

    // Push
    console.log('  Pushing branch...');
    run(`git push -u origin ${branchName}`);

    // Create PR
    console.log('  Creating PR...');
    const prBody = `## Prompts Sync: ${profile}

This PR merges upstream prompt changes with the ${profile} profile's customizations.

### What happened
- Extracted current vanilla prompt from gemini-cli
- Applied exact text from \`preferences.md\` (preserved verbatim)
- Applied semantic preferences
- Removed sections marked for removal

### Review checklist
- [ ] Exact text from preferences.md appears verbatim (not paraphrased)
- [ ] Structural changes (removed sections) are correct
- [ ] New upstream features are included where appropriate
- [ ] Safety/security content is preserved

---
*Generated by \`hierophage prompts sync\`*`;

    const prUrl = run(`gh pr create --title "Sync ${profile} profile prompts" --body "${prBody.replace(/"/g, '\\"')}" --assignee @me`);

    console.log(`\n  PR created: ${prUrl}`);

    // Switch back to original branch
    run(`git checkout ${currentBranch}`);

    return prUrl;

  } catch (error) {
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
  const vanillaCachePath = join(profileDir, 'vanilla-cache.md');

  // Check prerequisites
  if (!existsSync(profileDir)) {
    console.error(`Error: Profile directory not found: ${profileDir}`);
    process.exit(1);
  }

  if (!existsSync(preferencesPath)) {
    console.error(`Error: Preferences file not found: ${preferencesPath}`);
    process.exit(1);
  }

  // Check gh is available for PR creation
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
  console.log(`  Output: ${systemMdPath}\n`);

  // Get vanilla prompt
  let vanillaPrompt;
  if (args.skipExtract && existsSync(vanillaCachePath)) {
    console.log('Using cached vanilla prompt...\n');
    vanillaPrompt = readFile(vanillaCachePath);
  } else {
    try {
      vanillaPrompt = await extractVanilla();
      // Cache it
      writeFileSync(vanillaCachePath, vanillaPrompt);
      console.log(`Vanilla prompt extracted (${vanillaPrompt.length} chars)\n`);
    } catch (error) {
      console.error('Failed to extract vanilla prompt:', error.message);
      if (existsSync(vanillaCachePath)) {
        console.log('Falling back to cached vanilla...');
        vanillaPrompt = readFile(vanillaCachePath);
      } else {
        process.exit(1);
      }
    }
  }

  // Read other inputs
  const preferences = readFile(preferencesPath);
  const currentUserPrompt = readFile(systemMdPath);

  if (!preferences) {
    console.error('Error: Could not read preferences');
    process.exit(1);
  }

  // Build merge prompt
  const mergePrompt = buildMergePrompt(vanillaPrompt, currentUserPrompt, preferences);

  console.log('Calling LLM to merge prompts...');
  console.log('(This may take a moment)\n');

  try {
    const newSystemMd = await callLLM(mergePrompt);

    if (!newSystemMd || newSystemMd.length < 100) {
      console.error('Error: LLM returned empty or too short response');
      process.exit(1);
    }

    console.log(`Generated merged prompt (${newSystemMd.length} chars)`);

    if (args.dryRun) {
      console.log('\n' + '='.repeat(60));
      console.log('GENERATED SYSTEM.MD (dry run)');
      console.log('='.repeat(60) + '\n');
      console.log(newSystemMd);
      console.log('\n' + '='.repeat(60));
      console.log('(dry run - no PR created)');
      process.exit(0);
    }

    // Create PR
    const prUrl = createPR(args.profile, systemMdPath, newSystemMd);

    console.log('\nDone! Review and merge the PR to apply changes.');
    console.log('After merging, run: npm run hierophage:install');

  } catch (error) {
    console.error('Error during sync:', error.message);
    process.exit(1);
  }
}

main();
