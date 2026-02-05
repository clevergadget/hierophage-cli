#!/usr/bin/env node
/**
 * Hierophage CLI wrapper
 *
 * Handles profile resolution and environment setup before spawning the gemini CLI.
 *
 * Profile resolution priority:
 * 1. --profile / -P command line argument
 * 2. HIEROPHAGE_PROFILE environment variable
 * 3. .hierophage/profile file in current directory (or parents)
 * 4. Default profile from profiles.json
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration paths
const HIEROPHAGE_DIR = join(homedir(), '.hierophage');
const PROFILES_PATH = join(HIEROPHAGE_DIR, 'profiles.json');
const GEMINI_BINARY = join(__dirname, '../../bundle/hierophage.js');

/**
 * Parse command line arguments for profile flag
 * Returns { profileName, remainingArgs }
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  let profileName = null;
  const remainingArgs = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--profile' || arg === '-P') {
      // Next arg is the profile name
      if (i + 1 < args.length) {
        profileName = args[i + 1];
        i++; // Skip next arg
      }
    } else if (arg.startsWith('--profile=')) {
      profileName = arg.slice('--profile='.length);
    } else if (arg.startsWith('-P=')) {
      profileName = arg.slice('-P='.length);
    } else {
      remainingArgs.push(arg);
    }
  }

  return { profileName, remainingArgs };
}

/**
 * Find .hierophage/profile file walking up from cwd
 */
function findProjectProfile(startDir) {
  let dir = startDir;

  while (dir !== dirname(dir)) { // Stop at filesystem root
    const profileFile = join(dir, '.hierophage', 'profile');
    if (existsSync(profileFile)) {
      try {
        return readFileSync(profileFile, 'utf-8').trim();
      } catch {
        // Continue searching
      }
    }

    // Also check .gemini/profile for compatibility
    const geminiProfileFile = join(dir, '.gemini', 'profile');
    if (existsSync(geminiProfileFile)) {
      try {
        return readFileSync(geminiProfileFile, 'utf-8').trim();
      } catch {
        // Continue searching
      }
    }

    dir = dirname(dir);
  }

  return null;
}

/**
 * Load profiles configuration
 */
function loadProfiles() {
  if (!existsSync(PROFILES_PATH)) {
    return null;
  }

  try {
    const content = readFileSync(PROFILES_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Warning: Failed to load profiles from ${PROFILES_PATH}:`, error.message);
    return null;
  }
}

/**
 * Resolve which profile to use
 */
function resolveProfile(cliProfile, envProfile, projectProfile, profiles) {
  // Priority: CLI > env > project > default
  const profileName = cliProfile || envProfile || projectProfile || profiles?.default || 'vanilla';

  if (!profiles || !profiles.profiles || !profiles.profiles[profileName]) {
    if (profileName !== 'vanilla') {
      console.error(`Warning: Profile '${profileName}' not found. Using vanilla.`);
    }
    return { name: 'vanilla', config: null };
  }

  return { name: profileName, config: profiles.profiles[profileName] };
}

/**
 * Apply profile configuration to environment
 */
function applyProfile(profile, env) {
  if (!profile.config) {
    return env;
  }

  const newEnv = { ...env };
  const config = profile.config;

  // Handle system prompt
  if (config.systemPrompt === 'none') {
    // Disable all prompt sections for bare profile
    newEnv.GEMINI_SYSTEM_MD = '0';
  } else if (config.systemPrompt === 'default') {
    // Use default gemini-cli behavior (don't set override)
    delete newEnv.GEMINI_SYSTEM_MD;
  } else if (config.systemPrompt) {
    // Custom system prompt path
    const promptPath = config.systemPrompt.startsWith('~')
      ? join(homedir(), config.systemPrompt.slice(1))
      : config.systemPrompt;
    newEnv.GEMINI_SYSTEM_MD = promptPath;
  }

  // Handle prompt section toggles
  if (config.promptSections) {
    for (const [section, enabled] of Object.entries(config.promptSections)) {
      if (!enabled) {
        newEnv[`GEMINI_PROMPT_${section.toUpperCase()}`] = '0';
      }
    }
  }

  // Handle user memory toggle
  if (config.userMemory === false) {
    // Note: gemini-cli doesn't have a direct env var for this yet
    // This is a placeholder for future implementation
    newEnv.HIEROPHAGE_DISABLE_USER_MEMORY = '1';
  }

  // Set profile name for hooks/extensions to reference
  newEnv.HIEROPHAGE_PROFILE = profile.name;

  return newEnv;
}

/**
 * Handle hierophage subcommands (prompts, etc.)
 */
async function handleSubcommand(args) {
  if (args[0] === 'prompts' && args[1] === 'sync') {
    // Delegate to prompts-sync.js
    const syncScript = join(__dirname, 'prompts-sync.js');
    const child = spawn('node', [syncScript, ...args.slice(2)], {
      stdio: 'inherit',
      env: process.env,
    });
    return new Promise((resolve) => child.on('exit', resolve));
  }
  if (args[0] === 'stig') {
    // Delegate to stigmergy CLI
    const stigCli = join(__dirname, '../../packages/stigmergy/dist/src/cli/cli.js');
    const child = spawn('node', [stigCli, ...args.slice(1)], {
      stdio: 'inherit',
      env: process.env,
    });
    return new Promise((resolve) => child.on('exit', resolve));
  }
  return null; // Not a subcommand
}

/**
 * Main entry point
 */
async function main() {
  const rawArgs = process.argv.slice(2);

  // Check for hierophage-specific subcommands first
  const subcommandResult = await handleSubcommand(rawArgs);
  if (subcommandResult !== null) {
    process.exitCode = subcommandResult;
    return;
  }

  const { profileName: cliProfile, remainingArgs } = parseArgs(process.argv);
  const envProfile = process.env.HIEROPHAGE_PROFILE;
  const projectProfile = findProjectProfile(process.cwd());
  const profiles = loadProfiles();

  const profile = resolveProfile(cliProfile, envProfile, projectProfile, profiles);

  // Show profile info if not vanilla (subtle indicator)
  if (profile.name !== 'vanilla' && profile.config) {
    const desc = profile.config.description || profile.name;
    console.error(`[${profile.name}] ${desc}`);
  }

  const env = applyProfile(profile, process.env);

  const child = spawn('node', [GEMINI_BINARY, ...remainingArgs], {
    stdio: 'inherit',
    env
  });

  process.exitCode = await new Promise((resolve) => {
    child.on('exit', resolve);
  });
}

main().catch((error) => {
  console.error('Hierophage wrapper error:', error.message);
  process.exit(1);
});
