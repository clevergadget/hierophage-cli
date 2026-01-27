#!/usr/bin/env node
/* global console, process */
// Setup script to configure git remote and disable CI/checks for personal fork
import { execSync } from 'child_process';
import { rmSync, existsSync, writeFileSync } from 'fs';

try {
  // Check if upstream remote already exists
  const remotes = execSync('git remote', { encoding: 'utf-8' });

  if (!remotes.includes('upstream')) {
    console.log('Adding upstream remote...');
    execSync('git remote add upstream https://github.com/google-gemini/gemini-cli.git', {
      stdio: 'inherit'
    });
    console.log('✓ Upstream remote added');
  } else {
    console.log('✓ Upstream remote already configured');
  }

  // Clean up workflows if upstream merge restored them
  const workflowsPath = '.github/workflows';
  if (existsSync(workflowsPath)) {
    console.log('Removing restored GitHub Actions workflows...');
    rmSync(workflowsPath, { recursive: true, force: true });
    console.log('✓ Workflows removed');
  }

  // Ensure husky hooks are disabled (survive node_modules reinstalls)
  const huskyHooks = ['.husky/pre-commit', '.husky/commit-msg', '.husky/pre-push'];
  const disabledHook = '#!/bin/sh\nexit 0\n';

  for (const hook of huskyHooks) {
    if (existsSync(hook)) {
      writeFileSync(hook, disabledHook);
    }
  }
  console.log('✓ Husky hooks disabled');
} catch (error) {
  console.error('Setup warning (not critical):', error.message);
}
