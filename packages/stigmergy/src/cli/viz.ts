import { join } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { generateVizHtml } from '../viz/generate.js';

export function vizCommand(stigRoot: string): void {
  const workspacePath = join(stigRoot, 'workspace');

  if (!existsSync(join(workspacePath, 'root.md'))) {
    console.error(chalk.red('No workspace found. Run `hierophage stig init "your goal"` first.'));
    process.exit(1);
  }

  const html = generateVizHtml(workspacePath);
  const outPath = join(tmpdir(), 'stig-viz.html');
  writeFileSync(outPath, html, 'utf-8');

  console.log(chalk.dim(`Wrote: ${outPath}`));

  // Open in default browser
  try {
    if (process.platform === 'darwin') {
      execSync(`open "${outPath}"`);
    } else if (process.platform === 'linux') {
      execSync(`xdg-open "${outPath}"`);
    } else {
      execSync(`start "${outPath}"`);
    }
    console.log(chalk.green('Opened in browser.'));
  } catch {
    console.log(`Open manually: ${outPath}`);
  }
}
