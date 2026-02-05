import type { Mutation, StigNode } from '../types.js';
import { createMutation } from '../dispatch/mutations.js';
import { listChildren } from '../tree/node.js';

/**
 * Grazer Report: what the grazer found and proposes to prune.
 */
export interface GrazerReport {
  /** Nodes with no substance after existing for multiple pulses */
  stagnantNodes: string[];
  /** Nodes with placeholder content ("TBD", "TODO", etc.) */
  placeholderNodes: string[];
  /** Nodes that are orphaned branches (deep with no siblings and no children) */
  witheredBranches: string[];
  /** Proposed DELETE_NODE mutations */
  mutations: Mutation[];
}

/**
 * Grazer: Necrophoresis agent for pruning dead nodes.
 *
 * In ant colonies, necrophoresis is the behavior of carrying dead colony members
 * out of the nest. The Grazer performs this function for the specification tree,
 * identifying nodes that fragment the spec without contributing substance.
 *
 * Unlike Scout, the Grazer can produce DELETE_NODE mutations. These should be
 * reviewed before applying — pruning is irreversible.
 *
 * Detection criteria:
 * - Stagnant: confidence 0, need > 3, and node has existed for 5+ pulses without growth
 * - Placeholder: content is minimal and matches placeholder patterns
 * - Withered: deep node (depth >= 4) with no children and no siblings
 */
export class Grazer {
  /**
   * Scan the tree and identify nodes that should be pruned.
   *
   * @param nodes - All nodes in the tree
   * @param workspacePath - Path to workspace for checking children
   * @param pulsesElapsed - How many pulses have occurred (for stagnation detection)
   */
  patrol(nodes: StigNode[], workspacePath: string, pulsesElapsed = 0): GrazerReport {
    const stagnantNodes: string[] = [];
    const placeholderNodes: string[] = [];
    const witheredBranches: string[] = [];
    const mutations: Mutation[] = [];

    // Build sibling counts per parent
    const siblingCounts = new Map<string, number>();
    for (const node of nodes) {
      const parent = getParentPath(node.path);
      siblingCounts.set(parent, (siblingCounts.get(parent) ?? 0) + 1);
    }

    for (const node of nodes) {
      // Never prune root or scaffolds
      if (node.path === '.' || node.isScaffold) continue;

      const depth = getDepth(node.path);
      const children = listChildren(workspacePath, node.path);
      const parent = getParentPath(node.path);
      const siblingCount = siblingCounts.get(parent) ?? 1;

      // Stagnant detection: zero confidence, high need, no children, after warmup
      if (
        pulsesElapsed >= 10 &&
        node.signals.confidence === 0 &&
        node.signals.need > 3 &&
        children.length === 0
      ) {
        stagnantNodes.push(node.path);
        mutations.push(createMutation('DELETE_NODE', node.path, {}));
        continue;
      }

      // Placeholder detection: minimal content matching placeholder patterns
      if (isPlaceholder(node)) {
        placeholderNodes.push(node.path);
        mutations.push(createMutation('DELETE_NODE', node.path, {}));
        continue;
      }

      // Withered branch: deep, childless, and alone (no siblings)
      // These often indicate over-decomposition that went nowhere
      if (depth >= 4 && children.length === 0 && siblingCount === 1) {
        witheredBranches.push(node.path);
        mutations.push(createMutation('DELETE_NODE', node.path, {}));
        continue;
      }
    }

    return {
      stagnantNodes,
      placeholderNodes,
      witheredBranches,
      mutations,
    };
  }
}

/**
 * Check if a node's content is just a placeholder.
 */
function isPlaceholder(node: StigNode): boolean {
  const content = (node.content ?? '').trim().toLowerCase();

  // Empty or very short content
  if (content.length < 20) {
    // But not if confidence is already high (someone verified it's intentionally brief)
    if (node.signals.confidence >= 5) return false;
    return true;
  }

  // Known placeholder patterns
  const placeholderPatterns = [
    /^tbd\.?$/i,
    /^todo\.?$/i,
    /^placeholder\.?$/i,
    /^to be determined\.?$/i,
    /^needs work\.?$/i,
    /^awaiting.*specification/i,
    /^decomposed from/i, // MockSpore's default content
  ];

  for (const pattern of placeholderPatterns) {
    if (pattern.test(content)) return true;
  }

  return false;
}

function getDepth(path: string): number {
  if (path === '.' || path === '') return 0;
  return path.split('/').filter(Boolean).length;
}

function getParentPath(nodePath: string): string {
  if (nodePath === '.' || nodePath === '') return '';
  const parts = nodePath.split('/');
  return parts.length === 1 ? '.' : parts.slice(0, -1).join('/');
}
