import express from 'express';
import cors from 'cors';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { workspaceRouter } from './routes/workspace.js';
import { treeRouter } from './routes/tree.js';
import { runRouter } from './routes/run.js';
import { replayRouter } from './routes/replay.js';

const app = express();
app.use(cors());
app.use(express.json());

// Resolve stig root — check env, then default
const stigRoot = process.env['STIG_ROOT'] || join(process.env['HOME'] || '~', '.hierophage', 'stig');

// Inject stigRoot into all routes
app.use((req, _res, next) => {
  req.app.locals.stigRoot = stigRoot;
  next();
});

// Serve static client in production
const clientDist = join(import.meta.dirname, '..', 'client');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

app.use('/api', workspaceRouter);
app.use('/api', treeRouter);
app.use('/api', runRouter);
app.use('/api', replayRouter);

// SPA fallback for client-side routing
if (existsSync(clientDist)) {
  app.get('{*path}', (_req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
}

const port = parseInt(process.env['PORT'] || '3001', 10);
app.listen(port, () => {
  console.log(`Stigmergy web server running on http://localhost:${port}`);
  console.log(`Stig root: ${stigRoot}`);
});
