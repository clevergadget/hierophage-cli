#!/usr/bin/env node
/**
 * Extract vanilla system prompt from gemini-cli
 *
 * Uses GEMINI_WRITE_SYSTEM_MD to capture the actual generated prompt.
 * Bypasses hierophage wrapper to get true vanilla (no profile applied).
 *
 * Usage:
 *   node extract-vanilla.js [output-path]
 *   node extract-vanilla.js              # outputs to stdout
 *   node extract-vanilla.js /tmp/out.md  # writes to file
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync, unlinkSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = join(__dirname, '../..');
const GEMINI_BINARY = join(REPO_ROOT, 'bundle/hierophage.js');

/**
 * Extract vanilla prompt by running gemini-cli with GEMINI_WRITE_SYSTEM_MD
 */
async function extractVanilla() {
  const tempFile = join(tmpdir(), `hierophage-vanilla-${Date.now()}.md`);

  return new Promise((resolve, reject) => {
    // Run the underlying binary directly (bypassing our wrapper)
    // Use -p with a minimal prompt to trigger prompt generation
    // The prompt gets written as a side effect
    const child = spawn('node', [GEMINI_BINARY, '-p', 'Say only: OK'], {
      env: {
        ...process.env,
        // Write the generated prompt to our temp file
        GEMINI_WRITE_SYSTEM_MD: tempFile,
        // Ensure we're not using any profile overrides
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
      // Read the extracted prompt
      if (existsSync(tempFile)) {
        try {
          const content = readFileSync(tempFile, 'utf-8');
          // Clean up temp file
          unlinkSync(tempFile);
          resolve(content);
        } catch (error) {
          reject(new Error(`Failed to read extracted prompt: ${error.message}`));
        }
      } else {
        // Prompt file wasn't created - might be auth issue or other error
        reject(new Error(`Prompt extraction failed (exit ${code}). The CLI may need authentication or encountered an error.\n${stderr}`));
      }
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to spawn CLI: ${error.message}`));
    });
  });
}

/**
 * Main
 */
async function main() {
  const outputPath = process.argv[2];

  try {
    console.error('Extracting vanilla prompt from gemini-cli...');
    console.error('(This makes a minimal API call to trigger prompt generation)');

    const vanilla = await extractVanilla();

    if (!vanilla || vanilla.length < 100) {
      console.error('Error: Extracted prompt is too short or empty');
      process.exit(1);
    }

    if (outputPath) {
      const { writeFileSync } = await import('fs');
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, vanilla);
      console.error(`Written to: ${outputPath}`);
      console.error(`Length: ${vanilla.length} characters`);
    } else {
      // Output to stdout
      console.log(vanilla);
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
