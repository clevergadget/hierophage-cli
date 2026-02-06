import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readNode, nodeExists } from './node.js';
import type { StigNode, TreeStats, ColonyPhase } from '../types.js';

// Re-export ColonyPhase from types for backwards compatibility
export type { ColonyPhase } from '../types.js';

/**
 * Determine colony phase from tree statistics.
 * Uses average confidence as the quorum signal.
 */
export function getColonyPhase(stats: TreeStats): ColonyPhase {
  const conf = stats.avg_confidence;
  if (conf < 3) return 'germination';
  if (conf < 5) return 'foraging';
  if (conf < 7) return 'brood-care';
  return 'crystallization';
}

/**
 * Build phase-specific guidance for agents.
 * Tells the agent what behavior is appropriate for the current colony state.
 */
export function buildPhaseGuidance(phase: ColonyPhase, stats: TreeStats): string {
  const lines = [
    `\n## Colony State: ${phase.toUpperCase()}`,
    `Nodes: ${stats.total_nodes} | Avg confidence: ${stats.avg_confidence} | Stable: ${stats.stable_count}`,
  ];

  switch (phase) {
    case 'germination':
      lines.push(`
The colony is young. Territory must be established.
- **Preferred action: DECOMPOSE** — break high-need nodes into 2-4 children
- Create children with substantive content (50+ words), not empty placeholders
- Each child must cover a distinct sub-concern
- Avoid: settling prematurely, shallow content`);
      break;

    case 'foraging':
      lines.push(`
The colony is exploring. Paths are being reinforced.
- **Preferred action: REVIEW** — assess existing children, update signals
- If children fully cover the parent's scope, boost parent confidence
- If gaps remain, DECOMPOSE further or UPDATE_CONTENT to fill gaps
- Avoid: creating redundant children, ignoring existing structure`);
      break;

    case 'brood-care':
      lines.push(`
The colony is maturing. Time to nurture depth.
- **Preferred action: UPDATE_CONTENT** — add detail, examples, acceptance criteria
- Content should be specific enough for a developer to implement from
- Include: data formats, API shapes, edge cases, error conditions
- Raise confidence when content is substantive
- Avoid: further decomposition unless truly necessary`);
      break;

    case 'crystallization':
      lines.push(`
The colony is solidifying. Lock in structure.
- **Preferred action: SETTLE** — mark nodes as resolved (confidence 8-9, need 1-2)
- Only settle if content is truly implementation-ready
- Review for completeness one final time
- Avoid: unnecessary changes, new decomposition`);
      break;
  }

  return lines.join('\n');
}

/**
 * Recursively scan the workspace and return all nodes with signals.
 */
export function scanTree(workspacePath: string): StigNode[] {
  const nodes: StigNode[] = [];

  // Start with root
  if (nodeExists(workspacePath, '.')) {
    nodes.push(readNode(workspacePath, '.'));
  }

  // Recursively scan directories
  scanDirectory(workspacePath, workspacePath, '', nodes);

  return nodes;
}

function scanDirectory(
  workspacePath: string,
  currentDir: string,
  relativePath: string,
  nodes: StigNode[],
): void {
  if (!existsSync(currentDir)) return;

  let entries: string[];
  try {
    entries = readdirSync(currentDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    // Skip hidden dirs and root.md (already handled)
    if (entry.startsWith('.') || entry === 'root.md') continue;

    const fullPath = join(currentDir, entry);
    if (!statSync(fullPath).isDirectory()) continue;

    const childRelPath = relativePath ? `${relativePath}/${entry}` : entry;

    if (nodeExists(workspacePath, childRelPath)) {
      nodes.push(readNode(workspacePath, childRelPath));
    }

    // Recurse into subdirectories
    scanDirectory(workspacePath, fullPath, childRelPath, nodes);
  }
}

/**
 * Find the node with the highest priority for work.
 * Priority: highest need, lowest confidence, then conflict as tiebreaker.
 * Scaffold nodes get a slight priority boost.
 */
export function findHighestPriority(nodes: StigNode[]): StigNode | null {
  if (nodes.length === 0) return null;

  // Root is selectable — it holds the goal and needs decomposition too
  const workNodes = nodes.filter((n) => n.signals.need > 0);

  if (workNodes.length === 0) return null;

  return workNodes.reduce((best, current) => {
    const bestScore = priorityScore(best);
    const currentScore = priorityScore(current);
    return currentScore > bestScore ? current : best;
  });
}

/**
 * Select the N highest priority nodes for parallel processing.
 * Returns nodes sorted by priority (highest first).
 * Filters out nodes that share a parent to reduce mutation conflicts.
 */
export function selectNHighestPriority(nodes: StigNode[], n: number): StigNode[] {
  if (nodes.length === 0 || n <= 0) return [];

  const workNodes = nodes.filter((n) => n.signals.need > 0);
  if (workNodes.length === 0) return [];

  // Sort by priority score (descending)
  const sorted = [...workNodes].sort((a, b) => priorityScore(b) - priorityScore(a));

  if (n === 1) return [sorted[0]];

  // Select up to N nodes, avoiding siblings (nodes with same parent)
  const selected: StigNode[] = [];
  const selectedParents = new Set<string>();

  for (const node of sorted) {
    if (selected.length >= n) break;

    const parent = getParentPath(node.path);

    // Skip if we already have a sibling selected (reduces conflict risk)
    if (selectedParents.has(parent)) continue;

    selected.push(node);
    selectedParents.add(parent);
  }

  return selected;
}

function getParentPath(nodePath: string): string {
  if (nodePath === '.') return '';
  const parts = nodePath.split('/');
  return parts.length === 1 ? '.' : parts.slice(0, -1).join('/');
}

function priorityScore(node: StigNode): number {
  // Higher need + lower confidence + some conflict weight = higher priority
  const base = node.signals.need * 2 - node.signals.confidence + node.signals.conflict * 0.5;
  // Scaffold nodes get a small boost so structural work happens first
  const scaffoldBoost = node.isScaffold ? 1 : 0;
  // Depth penalty: deeper nodes compete less aggressively to prevent branch gravity wells.
  // Root (path '.') = depth 0, 'testing' = depth 1, 'testing/unit' = depth 2, etc.
  // Increased from 0.3 to 0.5 to more strongly favor breadth over depth.
  const depth = node.path === '.' ? 0 : node.path.split('/').length;
  const depthPenalty = depth * 0.5;
  return base + scaffoldBoost - depthPenalty;
}

/**
 * Compute aggregate statistics for a set of nodes.
 */
export function getTreeStats(nodes: StigNode[]): TreeStats {
  if (nodes.length === 0) {
    return {
      total_nodes: 0,
      avg_confidence: 0,
      avg_need: 0,
      nodes_in_conflict: 0,
      stable_count: 0,
      scaffold_count: 0,
    };
  }

  let totalConfidence = 0;
  let totalNeed = 0;
  let inConflict = 0;
  let stable = 0;
  let scaffolds = 0;

  for (const node of nodes) {
    totalConfidence += node.signals.confidence;
    totalNeed += node.signals.need;
    if (node.signals.conflict > 2) inConflict++;
    if (node.signals.confidence >= 8 && node.signals.need <= 2 && node.signals.conflict <= 1) {
      stable++;
    }
    if (node.isScaffold) scaffolds++;
  }

  return {
    total_nodes: nodes.length,
    avg_confidence: Math.round((totalConfidence / nodes.length) * 10) / 10,
    avg_need: Math.round((totalNeed / nodes.length) * 10) / 10,
    nodes_in_conflict: inConflict,
    stable_count: stable,
    scaffold_count: scaffolds,
  };
}
