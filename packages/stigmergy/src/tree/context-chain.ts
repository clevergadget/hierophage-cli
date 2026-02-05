import { readNode, listChildren } from './node.js';
import type { StigNode } from '../types.js';

/**
 * Build the context chain from root to the target node.
 * Returns an array of StigNodes in order from root → target.
 *
 * For path "platform/target-os", the chain is:
 * [root, platform, target-os]
 */
export function buildContextChain(workspacePath: string, nodePath: string): StigNode[] {
  const chain: StigNode[] = [];

  // Always start with root
  chain.push(readNode(workspacePath, '.'));

  if (nodePath === '.' || nodePath === '' || nodePath === '/') {
    return chain;
  }

  // Walk each segment of the path
  const segments = nodePath.split('/').filter(Boolean);
  let currentPath = '';

  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    chain.push(readNode(workspacePath, currentPath));
  }

  return chain;
}

/**
 * Assemble a context chain into a prompt-ready string.
 * Each node's content is separated by a depth header.
 * Optional neighbor summaries are appended.
 */
export function assembleContext(chain: StigNode[], neighbors?: StigNode[]): string {
  const parts: string[] = [];

  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    const depth = i === 0 ? 'ROOT' : `DEPTH ${i}`;
    const signalSummary = `[need:${node.signals.need} confidence:${node.signals.confidence} conflict:${node.signals.conflict}]`;

    parts.push(`--- ${depth}: ${node.name} ${signalSummary} ---`);
    if (node.content) {
      parts.push(node.content);
    }
    parts.push('');
  }

  if (neighbors && neighbors.length > 0) {
    parts.push('--- SIBLINGS ---');
    for (const neighbor of neighbors) {
      const signalSummary = `[need:${neighbor.signals.need} confidence:${neighbor.signals.confidence} conflict:${neighbor.signals.conflict}]`;
      parts.push(`- ${neighbor.name} ${signalSummary}`);
      // Only include first line of sibling content as summary
      const firstLine = neighbor.content.split('\n')[0];
      if (firstLine) {
        parts.push(`  ${firstLine}`);
      }
    }
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Build context chain and get sibling nodes for a target.
 */
export function buildFullContext(workspacePath: string, nodePath: string): {
  chain: StigNode[];
  siblings: StigNode[];
} {
  const chain = buildContextChain(workspacePath, nodePath);

  // Find siblings: other children of the parent
  const parentPath = getParentPath(nodePath);
  const allChildren = listChildren(workspacePath, parentPath);
  const siblings = allChildren
    .filter((child) => child !== nodePath)
    .map((child) => readNode(workspacePath, child));

  return { chain, siblings };
}

function getParentPath(nodePath: string): string {
  if (nodePath === '.' || nodePath === '' || nodePath === '/') return '.';
  const segments = nodePath.split('/').filter(Boolean);
  if (segments.length <= 1) return '.';
  return segments.slice(0, -1).join('/');
}
