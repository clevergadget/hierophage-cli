import { Router } from 'express';
import { RunManager } from '../run-manager.js';

export const runRouter = Router();

const runManager = new RunManager();

/** POST /api/run — start a run */
runRouter.post('/run', async (req, res) => {
  const stigRoot: string = req.app.locals.stigRoot;
  const { maxPulses, parallel, dryRun } = req.body as {
    maxPulses?: number;
    parallel?: number;
    dryRun?: boolean;
  };

  if (runManager.active) {
    res.status(409).json({ error: 'Run already active' });
    return;
  }

  try {
    // Start async — don't await the full run
    runManager.start(stigRoot, { maxPulses, parallel, dryRun });
    res.json({ success: true, message: 'Run started' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to start run' });
  }
});

/** GET /api/run/stream — SSE endpoint for live pulse events */
runRouter.get('/run/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Send initial status
  res.write(`data: ${JSON.stringify({ type: 'connected', active: runManager.active })}\n\n`);

  runManager.addClient(res);

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

/** POST /api/run/stop — stop current run */
runRouter.post('/run/stop', (_req, res) => {
  if (!runManager.active) {
    res.status(404).json({ error: 'No active run' });
    return;
  }

  runManager.stop();
  res.json({ success: true });
});

/** GET /api/run/status — current run status */
runRouter.get('/run/status', (_req, res) => {
  res.json({
    active: runManager.active,
    pulseCount: runManager.pulseCount,
    phase: runManager.phase || undefined,
    startedAt: runManager.startedAt || undefined,
  });
});
