import { Router } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  scanTree,
  readNode,
  listChildren,
  getTreeStats,
  getColonyPhase,
  MutationDispatcher,
  createMutation,
} from '@hierophage/stigmergy';
import type { StigNode } from '@hierophage/stigmergy';
import type { VizNode } from '../../shared/types.js';

export const treeRouter = Router();

function isPlaceholder(node: StigNode): boolean {
  const content = (node.content ?? '').trim().toLowerCase();
  if (content.length < 20 && node.signals.confidence < 5) return true;
  const patterns = [/^tbd\.?$/i, /^todo\.?$/i, /^placeholder/i, /^decomposed from/i];
  return patterns.some((p) => p.test(content));
}

function buildHierarchy(workspacePath: string, nodes: StigNode[]): VizNode {
  const nodeMap = new Map<string, StigNode>();
  for (const n of nodes) nodeMap.set(n.path, n);

  function extractGoal(content: string): string | undefined {
    const match = content.match(/^#\s*Goal\s*\n+(.+)/m);
    return match?.[1]?.trim();
  }

  function buildNode(node: StigNode): VizNode {
    const childPaths = listChildren(workspacePath, node.path);
    const children = childPaths
      .map((cp) => nodeMap.get(cp))
      .filter((n): n is StigNode => n !== undefined)
      .map(buildNode);

    return {
      name: node.path === '.' ? (extractGoal(node.content) ?? node.name) : node.name,
      path: node.path,
      need: node.signals.need,
      confidence: node.signals.confidence,
      conflict: node.signals.conflict,
      conflictReasons: node.evidence.conflict_reasons ?? [],
      isScaffold: node.isScaffold,
      isPlaceholder: isPlaceholder(node),
      content: node.content,
      children,
    };
  }

  const root = nodes.find((n) => n.path === '.');
  if (!root) {
    return { name: 'empty', path: '.', need: 0, confidence: 0, conflict: 0, conflictReasons: [], isScaffold: false, isPlaceholder: false, content: '', children: [] };
  }

  return buildNode(root);
}

/** GET /api/tree — full VizNode hierarchy for D3 */
treeRouter.get('/tree', (req, res) => {
  const stigRoot: string = req.app.locals.stigRoot;
  const workspacePath = join(stigRoot, 'workspace');

  if (!existsSync(join(workspacePath, 'root.md'))) {
    res.json(null);
    return;
  }

  const nodes = scanTree(workspacePath);
  const hierarchy = buildHierarchy(workspacePath, nodes);
  res.json(hierarchy);
});

/** GET /api/status — tree stats + colony phase */
treeRouter.get('/status', (req, res) => {
  const stigRoot: string = req.app.locals.stigRoot;
  const workspacePath = join(stigRoot, 'workspace');

  if (!existsSync(join(workspacePath, 'root.md'))) {
    res.json(null);
    return;
  }

  const nodes = scanTree(workspacePath);
  const stats = getTreeStats(nodes);
  const phase = getColonyPhase(stats);

  res.json({ stats, phase });
});

/** GET /api/nodes/:path — single node detail */
treeRouter.get('/nodes/{*path}', (req, res) => {
  const stigRoot: string = req.app.locals.stigRoot;
  const workspacePath = join(stigRoot, 'workspace');
  const nodePath = (req.params as Record<string, string>).path || '.';

  try {
    const node = readNode(workspacePath, nodePath);
    const children = listChildren(workspacePath, nodePath);
    res.json({
      name: node.name,
      path: node.path,
      signals: node.signals,
      evidence: node.evidence,
      content: node.content,
      isScaffold: node.isScaffold,
      children,
    });
  } catch {
    res.status(404).json({ error: 'Node not found' });
  }
});

/** POST /api/nodes/:path/signals — update signals on a node */
treeRouter.post('/nodes/{*path}/signals', (req, res) => {
  const stigRoot: string = req.app.locals.stigRoot;
  const nodePath = (req.params as Record<string, string>).path || '.';
  const signals = req.body as Partial<{ need: number; confidence: number; conflict: number }>;

  const dispatcher = new MutationDispatcher(stigRoot);
  const result = dispatcher.dispatch(createMutation('UPDATE_SIGNALS', nodePath, { signals }));

  if (result.success) {
    res.json({ success: true });
  } else {
    res.status(400).json({ error: result.error });
  }
});
