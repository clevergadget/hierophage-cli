import type { StigNode } from '../types.js';
import type { Mutation } from '../types.js';
import { createMutation } from '../dispatch/mutations.js';

/**
 * Scout findings from analyzing a set of nodes.
 */
export interface ScoutReport {
  hollowNodes: string[];      // Empty placeholders
  tautologies: string[];      // Content restates name
  similarSiblings: Array<{ a: string; b: string }>;  // Near-duplicate siblings
  lowConfidence: string[];    // Underspecified nodes
  mutations: Mutation[];      // Conflict signal raises
}

/**
 * Scout: A heuristic agent that detects problems in the tree.
 * Does not use LLM — pure heuristics for v1.
 *
 * In stigmergic terms: scout ants that explore ahead of the colony,
 * detecting danger and dead ends. Deposits alarm pheromones (conflict signals)
 * on problematic nodes.
 */
export class Scout {
  readonly name = 'Scout';
  readonly isRealAI = false;

  /**
   * Patrol the given nodes and report problems.
   * Returns mutations that raise conflict signals on problematic nodes.
   */
  patrol(nodes: StigNode[]): ScoutReport {
    const report: ScoutReport = {
      hollowNodes: [],
      tautologies: [],
      similarSiblings: [],
      lowConfidence: [],
      mutations: [],
    };

    // Group nodes by parent for sibling analysis
    const siblingGroups = groupByParent(nodes);

    for (const node of nodes) {
      // Skip root
      if (node.path === '.') continue;

      // Check for hollow nodes (empty placeholders)
      if (isHollow(node)) {
        report.hollowNodes.push(node.path);
        report.mutations.push(
          createMutation('UPDATE_SIGNALS', node.path, {
            signals: { conflict: Math.min(10, node.signals.conflict + 2) },
          }),
        );
      }

      // Check for tautologies (content just restates name)
      if (isTautology(node)) {
        report.tautologies.push(node.path);
        if (!report.hollowNodes.includes(node.path)) {
          report.mutations.push(
            createMutation('UPDATE_SIGNALS', node.path, {
              signals: { conflict: Math.min(10, node.signals.conflict + 1) },
            }),
          );
        }
      }

      // Flag low confidence nodes (already flagged elsewhere, but track for report)
      if (node.signals.confidence < 3 && node.content.length > 20) {
        report.lowConfidence.push(node.path);
      }
    }

    // Check for similar siblings
    for (const siblings of siblingGroups.values()) {
      if (siblings.length < 2) continue;

      for (let i = 0; i < siblings.length; i++) {
        for (let j = i + 1; j < siblings.length; j++) {
          if (areSimilar(siblings[i], siblings[j])) {
            report.similarSiblings.push({
              a: siblings[i].path,
              b: siblings[j].path,
            });
            // Raise conflict on both
            report.mutations.push(
              createMutation('UPDATE_SIGNALS', siblings[i].path, {
                signals: { conflict: Math.min(10, siblings[i].signals.conflict + 1) },
              }),
            );
            report.mutations.push(
              createMutation('UPDATE_SIGNALS', siblings[j].path, {
                signals: { conflict: Math.min(10, siblings[j].signals.conflict + 1) },
              }),
            );
          }
        }
      }
    }

    // Deduplicate mutations by path (keep highest conflict)
    report.mutations = deduplicateMutations(report.mutations);

    return report;
  }
}

/**
 * Check if a node is hollow (empty placeholder).
 * Hollow = content < 20 chars AND confidence < 3
 */
function isHollow(node: StigNode): boolean {
  const contentLength = node.content.trim().length;
  return contentLength < 20 && node.signals.confidence < 3;
}

/**
 * Check if a node's content is a tautology (just restates the name).
 */
function isTautology(node: StigNode): boolean {
  const content = node.content.toLowerCase().trim();
  const name = node.name.toLowerCase().replace(/-/g, ' ').replace(/_/g, ' ');

  // If content is very short, check if it's basically the name
  if (content.length < 50) {
    // Normalize: remove punctuation, extra spaces
    const normalizedContent = content.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
    const normalizedName = name.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');

    // Check if content is just the name or "the {name}" or "{name} concern"
    if (normalizedContent === normalizedName) return true;
    if (normalizedContent === `the ${normalizedName}`) return true;
    if (normalizedContent === `${normalizedName} concern`) return true;
    if (normalizedContent === `${normalizedName} concerns`) return true;
    if (normalizedContent.startsWith(normalizedName) && normalizedContent.length < normalizedName.length + 20) {
      return true;
    }
  }

  return false;
}

/**
 * Check if two siblings are similar enough to warrant merging.
 */
function areSimilar(a: StigNode, b: StigNode): boolean {
  const nameA = a.name.toLowerCase().replace(/-/g, ' ').replace(/_/g, ' ');
  const nameB = b.name.toLowerCase().replace(/-/g, ' ').replace(/_/g, ' ');

  // Check Levenshtein-like similarity on names
  if (nameA === nameB) return true;

  // Check if one contains the other
  if (nameA.includes(nameB) || nameB.includes(nameA)) {
    // But only if they're similar length (avoid "test" matching "test-coverage")
    if (Math.abs(nameA.length - nameB.length) < 5) {
      return true;
    }
  }

  // Check word overlap
  const wordsA = new Set(nameA.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(nameB.split(' ').filter(w => w.length > 2));
  const intersection = [...wordsA].filter(w => wordsB.has(w));

  // If > 70% word overlap, consider similar
  const overlapRatio = intersection.length / Math.max(wordsA.size, wordsB.size);
  if (overlapRatio > 0.7 && intersection.length >= 2) {
    return true;
  }

  return false;
}

/**
 * Group nodes by their parent path.
 */
function groupByParent(nodes: StigNode[]): Map<string, StigNode[]> {
  const groups = new Map<string, StigNode[]>();

  for (const node of nodes) {
    if (node.path === '.') continue;

    const parts = node.path.split('/');
    const parent = parts.length === 1 ? '.' : parts.slice(0, -1).join('/');

    if (!groups.has(parent)) {
      groups.set(parent, []);
    }
    groups.get(parent)!.push(node);
  }

  return groups;
}

/**
 * Deduplicate mutations, keeping the one with highest conflict for each path.
 */
function deduplicateMutations(mutations: Mutation[]): Mutation[] {
  const byPath = new Map<string, Mutation>();

  for (const m of mutations) {
    const existing = byPath.get(m.path);
    if (!existing) {
      byPath.set(m.path, m);
    } else {
      // Keep the one with higher conflict
      const existingConflict = (existing.payload as { signals?: { conflict?: number } }).signals?.conflict ?? 0;
      const newConflict = (m.payload as { signals?: { conflict?: number } }).signals?.conflict ?? 0;
      if (newConflict > existingConflict) {
        byPath.set(m.path, m);
      }
    }
  }

  return Array.from(byPath.values());
}
