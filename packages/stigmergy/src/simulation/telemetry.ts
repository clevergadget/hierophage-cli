import { appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { TelemetryEvent } from '../types.js';

/**
 * Lightweight JSONL telemetry writer.
 * Emits structured events during run() — one appendFileSync per event.
 * Output: {stigRoot}/telemetry.jsonl (cleared at each run start).
 */
export class TelemetryEmitter {
  private readonly filePath: string;

  constructor(stigRoot: string) {
    this.filePath = join(stigRoot, 'telemetry.jsonl');
    // Clear file at start of each run
    writeFileSync(this.filePath, '', 'utf-8');
  }

  /** Emit a telemetry event as a JSONL line. */
  emit(event: TelemetryEvent): void {
    const line = JSON.stringify(event);
    appendFileSync(this.filePath, line + '\n', 'utf-8');
  }

  /** Get the file path for this telemetry log. */
  get path(): string {
    return this.filePath;
  }
}

/**
 * Parse a telemetry.jsonl file into an array of events.
 */
export function parseTelemetryLog(filePath: string): TelemetryEvent[] {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf-8').trim();
  if (!content) return [];

  return content.split('\n').map((line) => JSON.parse(line) as TelemetryEvent);
}
