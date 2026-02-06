import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { watch } from 'chokidar';
import { parseTelemetryLog } from '@hierophage/stigmergy';
import type { TelemetryEvent } from '@hierophage/stigmergy';
import type { Response } from 'express';
import { fork, type ChildProcess } from 'node:child_process';

/**
 * Manages a single active run.
 * Spawns the run as a child process and watches telemetry.jsonl for live events.
 * Streams events to SSE clients.
 */
export class RunManager {
  private process: ChildProcess | null = null;
  private sseClients: Set<Response> = new Set();
  private lastLineCount = 0;
  private watcher: ReturnType<typeof watch> | null = null;
  private _active = false;
  private _pulseCount = 0;
  private _phase = '';
  private _startedAt = '';

  get active(): boolean { return this._active; }
  get pulseCount(): number { return this._pulseCount; }
  get phase(): string { return this._phase; }
  get startedAt(): string { return this._startedAt; }

  addClient(res: Response): void {
    this.sseClients.add(res);
    res.on('close', () => this.sseClients.delete(res));
  }

  private broadcast(event: string, data: unknown): void {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      client.write(msg);
    }
  }

  /**
   * Start a run by invoking the stig CLI as a child process.
   * We watch telemetry.jsonl for new events and stream them to SSE clients.
   */
  async start(stigRoot: string, options: { maxPulses?: number; parallel?: number; dryRun?: boolean }): Promise<void> {
    if (this._active) throw new Error('Run already active');

    this._active = true;
    this._pulseCount = 0;
    this._phase = '';
    this._startedAt = new Date().toISOString();
    this.lastLineCount = 0;

    const telemetryPath = join(stigRoot, 'telemetry.jsonl');

    // Build CLI args
    const args = ['run', '--confirm'];
    if (options.maxPulses) args.push('--max-pulses', String(options.maxPulses));
    if (options.parallel) args.push('--parallel', String(options.parallel));
    if (options.dryRun) args.push('--dry-run');

    // Find the stig CLI binary
    const stigBin = join(import.meta.dirname, '..', '..', '..', 'stigmergy', 'dist', 'src', 'cli', 'cli.js');

    // Start the process
    this.process = fork(stigBin, args, {
      env: { ...process.env, STIG_ROOT: stigRoot },
      silent: true,
    });

    // Watch telemetry file for new events
    this.watcher = watch(telemetryPath, { persistent: true, awaitWriteFinish: { stabilityThreshold: 100 } });

    this.watcher.on('change', () => {
      this.processNewEvents(telemetryPath);
    });

    // Also poll periodically in case watcher misses events
    const pollInterval = setInterval(() => {
      if (!this._active) {
        clearInterval(pollInterval);
        return;
      }
      this.processNewEvents(telemetryPath);
    }, 500);

    this.process.on('exit', () => {
      // Process final events
      this.processNewEvents(telemetryPath);
      this.cleanup();
      this.broadcast('run_end', { reason: 'completed' });
    });

    this.process.on('error', (err) => {
      this.broadcast('error', { message: err.message });
      this.cleanup();
    });
  }

  private processNewEvents(telemetryPath: string): void {
    if (!existsSync(telemetryPath)) return;

    try {
      const content = readFileSync(telemetryPath, 'utf-8').trim();
      if (!content) return;

      const lines = content.split('\n');
      if (lines.length <= this.lastLineCount) return;

      const newLines = lines.slice(this.lastLineCount);
      this.lastLineCount = lines.length;

      for (const line of newLines) {
        try {
          const event = JSON.parse(line) as TelemetryEvent;
          this.handleTelemetryEvent(event);
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // File might be mid-write
    }
  }

  private handleTelemetryEvent(event: TelemetryEvent): void {
    switch (event.type) {
      case 'pulse':
        this._pulseCount = event.pulse;
        this._phase = event.phase;
        this.broadcast('pulse', {
          pulse: event.pulse,
          target: event.target,
          action: event.action,
          reasoning: event.reasoning,
          mutations_attempted: event.mutations_attempted,
          mutations_succeeded: event.mutations_succeeded,
          cost: event.cost,
          phase: event.phase,
          stats: event.stats,
        });
        break;

      case 'phase_change':
        this._phase = event.to;
        this.broadcast('phase_change', { from: event.from, to: event.to });
        break;

      case 'run_end':
        this.broadcast('run_end', { reason: event.reason, detail: event.detail });
        break;

      case 'scout':
      case 'grazer':
      case 'verifier_stability':
      case 'verifier_coverage':
      case 'propagation':
      case 'resolver':
      case 'synthesizer':
        this.broadcast('maintenance', { agent: event.type, details: event });
        break;
    }
  }

  stop(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
    }
    this.cleanup();
  }

  private cleanup(): void {
    this._active = false;
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.process = null;
  }
}
