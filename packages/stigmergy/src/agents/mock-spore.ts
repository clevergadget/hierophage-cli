import type { Agent, AgentResult, ColonyContext } from './agent.js';
import type { Mutation, StigNode } from '../types.js';
import { createMutation } from '../dispatch/mutations.js';

/**
 * MockSpore: A deterministic agent for testing the simulation loop.
 *
 * Behavior (checked in order):
 * 1. If target has low need (≤ 3) or has children with some confidence:
 *    → Settle: set confidence to 9, need to 1
 * 2. If target is a leaf, low confidence, and not too deep:
 *    → Decompose: create 2 child nodes, bump parent confidence by 2
 * 3. Otherwise:
 *    → Review: bump confidence by 3, reduce need by 2
 *
 * This guarantees convergence: every pulse either decomposes (creating work)
 * or settles (reducing work). The tree reaches stability in bounded pulses.
 */

const MAX_DEPTH = 3;

/**
 * Deterministic sub-concern table. Given a node name, returns child names.
 * This makes MockSpore fully reproducible — same tree always produces same output.
 */
const DECOMPOSITION_TABLE: Record<string, string[]> = {
  testing: ['unit-tests', 'integration-tests'],
  deployment: ['build-pipeline', 'hosting'],
  'error-handling': ['validation', 'recovery'],
};

function getChildNames(nodeName: string): string[] {
  if (DECOMPOSITION_TABLE[nodeName]) {
    return DECOMPOSITION_TABLE[nodeName];
  }
  // Default: split into "design" and "implementation" sub-concerns
  return [`${nodeName}-design`, `${nodeName}-impl`];
}

function getDepth(path: string): number {
  if (path === '.' || path === '') return 0;
  return path.split('/').filter(Boolean).length;
}

export class MockSpore implements Agent {
  readonly name = 'MockSpore';
  readonly isRealAI = false;

  async run(target: StigNode, _context: string, children: StigNode[], _colony?: ColonyContext): Promise<AgentResult> {
    const mutations: Mutation[] = [];
    const depth = getDepth(target.path);

    if (target.signals.need <= 3 || (children.length > 0 && target.signals.confidence >= 3)) {
      // SETTLE: low need or already-decomposed with some review → stabilize
      mutations.push(
        createMutation('UPDATE_SIGNALS', target.path, {
          signals: { confidence: 9, need: 1 },
        }),
      );
    } else if (children.length === 0 && target.signals.confidence < 5 && depth < MAX_DEPTH) {
      // DECOMPOSE: leaf node that needs work → create children
      const childNames = getChildNames(target.name);
      const childNeed = Math.max(3, target.signals.need - 1);

      for (const childName of childNames) {
        const childPath = target.path === '.' ? childName : `${target.path}/${childName}`;
        mutations.push(
          createMutation('CREATE_NODE', childPath, {
            name: childName,
            content: `Decomposed from ${target.name}. Awaiting further specification.`,
            signals: { need: childNeed, confidence: 0 },
          }),
        );
      }

      // Parent gains confidence from having been decomposed
      mutations.push(
        createMutation('UPDATE_SIGNALS', target.path, {
          signals: { confidence: Math.min(10, target.signals.confidence + 2) },
        }),
      );
    } else {
      // REVIEW: has children or at max depth, increase confidence
      mutations.push(
        createMutation('UPDATE_SIGNALS', target.path, {
          signals: {
            confidence: Math.min(10, target.signals.confidence + 3),
            need: Math.max(1, target.signals.need - 2),
          },
        }),
      );
    }

    return {
      mutations,
      cost: { api_calls: 0, input_tokens: 0, output_tokens: 0 },
    };
  }
}
