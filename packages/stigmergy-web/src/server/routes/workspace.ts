import { Router } from 'express';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  readNode,
  scanTree,
  MutationDispatcher,
  createMutation,
  GoalAnalyst,
  DEFAULT_CONFIG,
  SCAFFOLD_SIGNALS,
  writeNode,
  DEFAULT_EVIDENCE,
} from '@hierophage/stigmergy';
import type { StigNode, WorkspaceConfig } from '@hierophage/stigmergy';

export const workspaceRouter = Router();

/** GET /api/workspace — check if workspace exists */
workspaceRouter.get('/workspace', (req, res) => {
  const stigRoot: string = req.app.locals.stigRoot;
  const workspacePath = join(stigRoot, 'workspace');
  const rootExists = existsSync(join(workspacePath, 'root.md'));

  if (!rootExists) {
    res.json({ exists: false });
    return;
  }

  const root = readNode(workspacePath, '.');
  const nodes = scanTree(workspacePath);
  res.json({
    exists: true,
    goal: root.name !== 'root' ? root.name : root.content.split('\n').find((l: string) => l.trim())?.replace(/^#\s*/, ''),
    nodeCount: nodes.length,
  });
});

/** POST /api/workspace/init — initialize workspace */
workspaceRouter.post('/workspace/init', async (req, res) => {
  const stigRoot: string = req.app.locals.stigRoot;
  const workspacePath = join(stigRoot, 'workspace');
  const { goal, context, analyze } = req.body as { goal: string; context?: string[]; analyze?: boolean };

  if (!goal) {
    res.status(400).json({ error: 'Goal is required' });
    return;
  }

  if (existsSync(join(workspacePath, 'root.md'))) {
    res.status(409).json({ error: 'Workspace already exists. Delete first.' });
    return;
  }

  mkdirSync(workspacePath, { recursive: true });
  writeFileSync(join(stigRoot, 'config.json'), JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
  writeFileSync(join(stigRoot, 'mutations.log'), '', 'utf-8');

  let rootContent = `# Goal\n\n${goal}`;
  if (context && context.length > 0) {
    rootContent += `\n\n# Given Context\n\nThe following implementation decisions are already made:\n`;
    for (const c of context) rootContent += `- ${c}\n`;
    rootContent += `\nDo not spec alternatives to these — they are settled.`;
  }

  const rootNode: StigNode = {
    path: '.',
    name: 'root',
    signals: { need: 10, confidence: 0, conflict: 0, workers_active: 0, last_pulse: new Date().toISOString() },
    evidence: { ...DEFAULT_EVIDENCE },
    content: rootContent,
    isScaffold: false,
  };
  writeNode(workspacePath, '.', rootNode);

  const dispatcher = new MutationDispatcher(stigRoot);

  if (analyze) {
    const apiKey = process.env['GEMINI_API_KEY'];
    if (apiKey) {
      try {
        const analyst = new GoalAnalyst('gemini-2.5-flash-lite', apiKey);
        const analysis = await analyst.analyze(goal);
        if (!analysis.error) {
          for (const concern of analysis.concerns) {
            dispatcher.dispatch(createMutation('CREATE_NODE', concern.name, {
              name: concern.name,
              signals: { ...SCAFFOLD_SIGNALS, last_pulse: new Date().toISOString() },
              isScaffold: true,
              content: concern.description,
            }));
          }
        }
      } catch {
        // Fall through to static scaffolds
      }
    }
  }

  // Always add static scaffolds if no analysis or analysis produced nothing
  const nodes = scanTree(workspacePath);
  if (nodes.length <= 1) {
    const scaffolds = [
      { name: 'user-flows', content: 'How people actually use this.' },
      { name: 'architecture', content: 'The structural decisions.' },
      { name: 'testing', content: 'Proving it works.' },
      { name: 'deployment', content: 'Getting it to users.' },
      { name: 'error-handling', content: 'What happens when things go wrong.' },
    ];
    for (const s of scaffolds) {
      dispatcher.dispatch(createMutation('CREATE_NODE', s.name, {
        name: s.name,
        signals: { ...SCAFFOLD_SIGNALS, last_pulse: new Date().toISOString() },
        isScaffold: true,
        content: s.content,
      }));
    }
  }

  res.json({ success: true, nodeCount: scanTree(workspacePath).length });
});

/** DELETE /api/workspace — clear workspace */
workspaceRouter.delete('/workspace', (_req, res) => {
  const stigRoot: string = _req.app.locals.stigRoot;

  if (existsSync(stigRoot)) {
    rmSync(stigRoot, { recursive: true, force: true });
  }

  res.json({ success: true });
});

/** GET /api/config — current config */
workspaceRouter.get('/config', (req, res) => {
  const stigRoot: string = req.app.locals.stigRoot;
  const configPath = join(stigRoot, 'config.json');

  if (!existsSync(configPath)) {
    res.json(DEFAULT_CONFIG);
    return;
  }

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as WorkspaceConfig;
    if (!config.budget) config.budget = DEFAULT_CONFIG.budget;
    res.json(config);
  } catch {
    res.json(DEFAULT_CONFIG);
  }
});

/** PUT /api/config — update config fields */
workspaceRouter.put('/config', (req, res) => {
  const stigRoot: string = req.app.locals.stigRoot;
  const configPath = join(stigRoot, 'config.json');

  let config: WorkspaceConfig;
  try {
    config = existsSync(configPath)
      ? JSON.parse(readFileSync(configPath, 'utf-8'))
      : { ...DEFAULT_CONFIG };
  } catch {
    config = { ...DEFAULT_CONFIG };
  }

  const updates = req.body as Partial<WorkspaceConfig>;
  Object.assign(config, updates);
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

  res.json(config);
});
