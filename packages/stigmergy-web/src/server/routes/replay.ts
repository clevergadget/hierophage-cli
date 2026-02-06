import { Router } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseTelemetryLog } from '@hierophage/stigmergy';
import type { TelemetryEvent } from '@hierophage/stigmergy';

export const replayRouter = Router();

/** GET /api/replay — full telemetry event array */
replayRouter.get('/replay', (req, res) => {
  const stigRoot: string = req.app.locals.stigRoot;
  const telemetryPath = join(stigRoot, 'telemetry.jsonl');

  if (!existsSync(telemetryPath)) {
    res.json([]);
    return;
  }

  const events = parseTelemetryLog(telemetryPath);
  res.json(events);
});

/** GET /api/replay/summary — run summary */
replayRouter.get('/replay/summary', (req, res) => {
  const stigRoot: string = req.app.locals.stigRoot;
  const telemetryPath = join(stigRoot, 'telemetry.jsonl');

  if (!existsSync(telemetryPath)) {
    res.json(null);
    return;
  }

  const events = parseTelemetryLog(telemetryPath);
  if (events.length === 0) {
    res.json(null);
    return;
  }

  const runStart = events.find((e): e is Extract<TelemetryEvent, { type: 'run_start' }> => e.type === 'run_start');
  const runEnd = events.find((e): e is Extract<TelemetryEvent, { type: 'run_end' }> => e.type === 'run_end');
  const pulseEvents = events.filter((e): e is Extract<TelemetryEvent, { type: 'pulse' }> => e.type === 'pulse');
  const phaseChanges = events.filter((e): e is Extract<TelemetryEvent, { type: 'phase_change' }> => e.type === 'phase_change');

  // Calculate total cost
  const totalCost = pulseEvents.reduce(
    (acc, p) => ({
      api_calls: acc.api_calls + p.cost.api_calls,
      input_tokens: acc.input_tokens + p.cost.input_tokens,
      output_tokens: acc.output_tokens + p.cost.output_tokens,
    }),
    { api_calls: 0, input_tokens: 0, output_tokens: 0 },
  );

  res.json({
    startedAt: runStart?.timestamp,
    endedAt: runEnd?.timestamp,
    goal: runStart?.goal,
    model: runStart?.model,
    reason: runEnd?.reason,
    detail: runEnd?.detail,
    totalPulses: pulseEvents.length,
    phaseTransitions: phaseChanges.map((p) => ({ from: p.from, to: p.to, pulse: p.pulse })),
    finalStats: runEnd?.stats,
    totalCost,
    maintenanceEvents: {
      scout: events.filter((e) => e.type === 'scout').length,
      grazer: events.filter((e) => e.type === 'grazer').length,
      verifier: events.filter((e) => e.type === 'verifier_stability' || e.type === 'verifier_coverage').length,
      resolver: events.filter((e) => e.type === 'resolver').length,
      synthesizer: events.filter((e) => e.type === 'synthesizer').length,
      termite: events.filter((e) => e.type === 'termite').length,
    },
  });
});
