#!/usr/bin/env node
/**
 * Install hierophage profiles to user's home directory
 *
 * Usage: node .hierophage/install-profiles.js [--force]
 *
 * Creates ~/.hierophage/ with:
 * - profiles.json (profile definitions)
 * - profiles/{ritual,kawazu,bare}/system.md (prompt templates)
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HIEROPHAGE_HOME = join(homedir(), '.hierophage');
const SOURCE_DIR = __dirname;
const FORCE = process.argv.includes('--force');

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`Created: ${dir}`);
  }
}

function copyIfNotExists(src, dest, description) {
  if (existsSync(dest) && !FORCE) {
    console.log(`Skipping (exists): ${description}`);
    return false;
  }

  ensureDir(dirname(dest));
  copyFileSync(src, dest);
  console.log(`${FORCE && existsSync(dest) ? 'Overwrote' : 'Created'}: ${description}`);
  return true;
}

function main() {
  console.log('Installing hierophage profiles...\n');

  // Create base directory
  ensureDir(HIEROPHAGE_HOME);

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

  console.log('\nDone! Profile system installed.');
  console.log('\nUsage:');
  console.log('  hierophage --profile ritual    # Use ritual profile');
  console.log('  hierophage --profile kawazu    # Use kawazu profile');
  console.log('  hierophage --profile bare      # No system prompt');
  console.log('  hierophage                     # Default (vanilla)');
  console.log('\nEdit ~/.hierophage/profiles.json to customize profiles.');
}

main();
