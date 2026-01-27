#!/usr/bin/env node
// Wrapper that calls the gemini binary with custom behavior
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Point to the actual hierophage binary in bundle/
const geminiBinary = join(__dirname, '../../bundle/hierophage.js');

const child = spawn('node', [geminiBinary, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env }
});

process.exitCode = await new Promise((resolve) => {
  child.on('exit', resolve);
});
