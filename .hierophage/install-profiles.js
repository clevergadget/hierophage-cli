#!/usr/bin/env node
/**
 * Install hierophage profiles and MCP servers to user's home directory
 *
 * Usage: node .hierophage/install-profiles.js [--force]
 *
 * Creates ~/.hierophage/ with:
 * - profiles.json (profile definitions)
 * - profiles/{ritual,kawazu,bare}/system.md (prompt templates)
 * - mcp-servers/ (MCP server code and dependencies)
 * - state/ (created empty, stores user data at runtime)
 *
 * Optionally updates ~/.gemini/settings.json with MCP server configuration.
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HIEROPHAGE_HOME = join(homedir(), '.hierophage');
const GEMINI_CONFIG = join(homedir(), '.gemini', 'settings.json');
const SOURCE_DIR = __dirname;
const FORCE = process.argv.includes('--force');
const SKIP_NPM = process.argv.includes('--skip-npm');

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`Created: ${dir}`);
  }
}

function copyIfNotExists(src, dest, description) {
  const existedBefore = existsSync(dest);
  if (existedBefore && !FORCE) {
    console.log(`Skipping (exists): ${description}`);
    return false;
  }

  ensureDir(dirname(dest));
  copyFileSync(src, dest);
  console.log(`${FORCE && existedBefore ? 'Overwrote' : 'Created'}: ${description}`);
  return true;
}

// Note: This function only copies files in the immediate directory, not subdirectories.
// This is intentional for the current use case (mcp-servers contains only flat files).
function copyDirectory(srcDir, destDir, description) {
  if (!existsSync(srcDir)) {
    console.log(`Skipping (source not found): ${description}`);
    return false;
  }

  ensureDir(destDir);
  const files = readdirSync(srcDir);
  let copied = false;

  for (const file of files) {
    // Skip node_modules - will be rebuilt with npm install
    if (file === 'node_modules') continue;

    const srcPath = join(srcDir, file);
    const destPath = join(destDir, file);
    const relPath = `${description}/${file}`;

    if (copyIfNotExists(srcPath, destPath, relPath)) {
      copied = true;
    }
  }

  return copied;
}

function configureMcpServer() {
  const mcpServerPath = join(HIEROPHAGE_HOME, 'mcp-servers', 'state-server.js');

  if (!existsSync(mcpServerPath)) {
    console.log('\nSkipping MCP configuration (server not installed)');
    return;
  }

  const mcpConfig = {
    command: 'node',
    args: [mcpServerPath],
    trust: true
  };

  if (!existsSync(GEMINI_CONFIG)) {
    // Create new settings file
    ensureDir(dirname(GEMINI_CONFIG));
    const settings = {
      mcpServers: {
        'hierophage-state': mcpConfig
      }
    };
    writeFileSync(GEMINI_CONFIG, JSON.stringify(settings, null, 2));
    console.log('\nCreated: ~/.gemini/settings.json with MCP server configuration');
    return;
  }

  // Update existing settings
  try {
    const settings = JSON.parse(readFileSync(GEMINI_CONFIG, 'utf-8'));

    if (!settings.mcpServers) {
      settings.mcpServers = {};
    }

    if (settings.mcpServers['hierophage-state'] && !FORCE) {
      console.log('\nSkipping MCP config (already configured in ~/.gemini/settings.json)');
      return;
    }

    settings.mcpServers['hierophage-state'] = mcpConfig;
    writeFileSync(GEMINI_CONFIG, JSON.stringify(settings, null, 2));
    console.log('\nUpdated: ~/.gemini/settings.json with MCP server configuration');
  } catch (e) {
    console.log(`\nWarning: Could not update ~/.gemini/settings.json: ${e.message}`);
    console.log('You may need to manually add the MCP server configuration.');
  }
}

function main() {
  console.log('Installing hierophage profiles and MCP servers...\n');

  // Create base directories
  ensureDir(HIEROPHAGE_HOME);
  ensureDir(join(HIEROPHAGE_HOME, 'state'));

  // Copy profiles.json
  copyIfNotExists(
    join(SOURCE_DIR, 'profiles.json'),
    join(HIEROPHAGE_HOME, 'profiles.json'),
    '~/.hierophage/profiles.json'
  );

  // Copy profile templates
  const profiles = ['ritual', 'kawazu', 'bare'];

  for (const profile of profiles) {
    const srcDir = join(SOURCE_DIR, 'profiles', profile);
    const destDir = join(HIEROPHAGE_HOME, 'profiles', profile);

    ensureDir(destDir);

    const systemMd = join(srcDir, 'system.md');
    if (existsSync(systemMd)) {
      copyIfNotExists(
        systemMd,
        join(destDir, 'system.md'),
        `~/.hierophage/profiles/${profile}/system.md`
      );
    }
  }

  // Copy MCP servers
  console.log('\n--- MCP Servers ---');
  const mcpSrcDir = join(SOURCE_DIR, 'mcp-servers');
  const mcpDestDir = join(HIEROPHAGE_HOME, 'mcp-servers');

  if (existsSync(mcpSrcDir)) {
    copyDirectory(mcpSrcDir, mcpDestDir, '~/.hierophage/mcp-servers');

    // Run npm install in MCP servers directory
    if (!SKIP_NPM && existsSync(join(mcpDestDir, 'package.json'))) {
      console.log('\nInstalling MCP server dependencies...');
      try {
        execSync('npm install', {
          cwd: mcpDestDir,
          stdio: 'inherit'
        });
        console.log('MCP server dependencies installed.');
      } catch (e) {
        console.log(`Warning: npm install failed: ${e.message}`);
        console.log('You may need to run: cd ~/.hierophage/mcp-servers && npm install');
      }
    }

    // Configure MCP server in gemini settings
    configureMcpServer();
  } else {
    console.log('No MCP servers found in source directory.');
  }

  console.log('\n--- Installation Complete ---');
  console.log('\nProfile system installed to ~/.hierophage/');
  console.log('\nUsage:');
  console.log('  hierophage --profile ritual    # Use ritual profile');
  console.log('  hierophage --profile kawazu    # Use kawazu profile');
  console.log('  hierophage --profile bare      # No system prompt');
  console.log('  hierophage                     # Default (vanilla)');
  console.log('\nEdit ~/.hierophage/profiles.json to customize profiles.');

  if (existsSync(join(mcpDestDir, 'state-server.js'))) {
    console.log('\nMCP state server installed. The ritual profile uses this for persistence.');
  }
}

main();
