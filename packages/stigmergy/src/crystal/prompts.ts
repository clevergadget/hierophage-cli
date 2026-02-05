import type { StigNode } from '../types.js';

export const CRYSTALLIZER_SYSTEM_PROMPT = `You are a specification writer. You receive a tree of decomposed concerns from a swarm-based specification engine. Each node has content and signal levels (need, confidence, conflict).

Synthesize these into coherent specification prose. Not concatenation — synthesis. The output should read as a specification document a developer could implement from.

Rules:
- Clear, direct technical prose. No filler.
- Preserve all specific details, acceptance criteria, and decisions.
- When nodes conflict (conflict > 2), note both positions and flag the tension.
- When confidence is low (< 5), mark sections as tentative / needs-resolution.
- Use markdown headers (##, ###) for structure.
- Include concrete details: data formats, API shapes, edge cases.
- Skip purely structural placeholders with no substantive content.
- Do not add information not present in the source nodes.
- Do not include any preamble or meta-commentary.

Tree Quality Assessment:
You will receive a tree health report with the source nodes. You MUST include a "## Tree Health" section at the END of each document that honestly reports problems with the source tree. This section should:
- Flag nodes that are empty placeholders with no real content.
- Flag areas where confidence is low — these are underspecified.
- Flag conflicts that remain unresolved.
- Flag branches that are shallow (only 1 level) and may need deeper decomposition.
- Flag areas where content is vague or tautological (restates the node name without adding detail).
- Be specific: name the nodes and the problem. Do not soften or hedge.
- If the tree is solid, say so briefly and move on.

The tree health section exists to prevent the crystal from masking deficiencies in the underlying specification work.`;

/**
 * Build a prompt for crystallizing a single branch of the tree.
 */
export function buildBranchPrompt(
  rootGoal: string,
  branchNode: StigNode,
  nodesFormatted: string,
  healthReport?: string,
): string {
  const parts: string[] = [];

  parts.push(`# Project Goal\n\n${rootGoal}\n`);
  parts.push(`# Branch: ${branchNode.name}\n`);
  if (branchNode.content) {
    parts.push(`${branchNode.content}\n`);
  }
  parts.push(`# Nodes in this branch\n\n${nodesFormatted}`);
  if (healthReport) {
    parts.push(`\n${healthReport}\n`);
  }
  parts.push(
    '\nSynthesize these nodes into a coherent specification document for this branch. ' +
    'Include a "## Tree Health" section at the end that honestly reports any quality issues.',
  );

  return parts.join('\n');
}

/**
 * Build a prompt for the overview document that ties all branches together.
 */
export function buildOverviewPrompt(
  rootGoal: string,
  branchSummaries: Array<{ name: string; opening: string }>,
  healthReport?: string,
): string {
  const parts: string[] = [];

  parts.push(`# Project Goal\n\n${rootGoal}\n`);
  parts.push('# Branch Summaries\n');

  for (const branch of branchSummaries) {
    parts.push(`## ${branch.name}\n\n${branch.opening}\n`);
  }

  if (healthReport) {
    parts.push(`\n${healthReport}\n`);
  }

  parts.push(
    '\nWrite an overview document that ties these branches together into a coherent project specification. ' +
    'Reference each branch by name. Highlight cross-cutting concerns and dependencies between branches. ' +
    'Include a "## Tree Health" section at the end that summarizes quality issues across all branches.',
  );

  return parts.join('\n');
}

/**
 * Format a list of nodes depth-first for inclusion in a prompt.
 * Heading level is based on depth: ## for top-level, ### for depth 2, etc.
 */
export function formatNodesForPrompt(
  nodes: StigNode[],
  branchPath: string,
): string {
  const lines: string[] = [];

  for (const node of nodes) {
    const depth = getRelativeDepth(node.path, branchPath);
    const hashes = '#'.repeat(Math.min(depth + 2, 6)); // ## for branch root, ### for children, etc.
    const sig = `[need:${node.signals.need} confidence:${node.signals.confidence} conflict:${node.signals.conflict}]`;

    lines.push(`${hashes} ${node.path} — ${node.name} ${sig}`);

    if (node.content) {
      lines.push('');
      lines.push(node.content);
    }

    lines.push('');
  }

  return lines.join('\n');
}

function getRelativeDepth(nodePath: string, branchPath: string): number {
  if (nodePath === branchPath) return 0;
  const remainder = nodePath.slice(branchPath.length + 1);
  return remainder.split('/').length;
}

export interface TreeHealthIssue {
  node: string;
  issue: string;
}

/**
 * Diagnose quality issues in a set of nodes.
 * Returns concrete, specific issues that the crystallizer should surface.
 */
export function diagnoseTreeHealth(nodes: StigNode[]): TreeHealthIssue[] {
  const issues: TreeHealthIssue[] = [];

  for (const node of nodes) {
    // Empty or near-empty content
    if (!node.content || node.content.trim().length < 10) {
      issues.push({ node: node.path, issue: 'empty or near-empty content — placeholder only' });
    }

    // Low confidence = underspecified
    if (node.signals.confidence < 5) {
      issues.push({
        node: node.path,
        issue: `low confidence (${node.signals.confidence}) — underspecified, needs more work`,
      });
    }

    // Unresolved conflict
    if (node.signals.conflict > 2) {
      issues.push({
        node: node.path,
        issue: `unresolved conflict (${node.signals.conflict}) — contradictions present`,
      });
    }

    // High need = work still needed
    if (node.signals.need > 5) {
      issues.push({
        node: node.path,
        issue: `high need (${node.signals.need}) — significant work remaining`,
      });
    }
  }

  // Branch depth check: if all nodes are at depth 0 (just the branch root, no children)
  if (nodes.length === 1) {
    issues.push({
      node: nodes[0].path,
      issue: 'shallow branch — only 1 node, no decomposition',
    });
  }

  return issues;
}

/**
 * Format health issues into a text block for inclusion in prompts.
 */
export function formatHealthReport(issues: TreeHealthIssue[]): string {
  if (issues.length === 0) {
    return '# Tree Health Report\n\nNo issues detected. Tree appears well-formed.';
  }

  const lines = ['# Tree Health Report\n'];
  for (const issue of issues) {
    lines.push(`- **${issue.node}**: ${issue.issue}`);
  }
  return lines.join('\n');
}
