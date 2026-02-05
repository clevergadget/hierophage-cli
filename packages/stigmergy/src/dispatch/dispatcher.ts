import { appendFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { readNode, writeNode, nodeExists } from '../tree/node.js';
import { validateMutation, formatLogEntry } from './mutations.js';
import type { Mutation, MutationResult, StigNode } from '../types.js';
import { DEFAULT_SIGNALS, DEFAULT_EVIDENCE } from '../types.js';

/**
 * MutationDispatcher: The single codepath for all workspace state changes.
 *
 * All mutations are:
 * 1. Validated (preconditions checked)
 * 2. Applied (filesystem change)
 * 3. Logged (append-only mutations.log)
 * 4. Returned (result with success/error)
 */
export class MutationDispatcher {
  private readonly workspacePath: string;
  private readonly logPath: string;

  constructor(stigRoot: string) {
    this.workspacePath = join(stigRoot, 'workspace');
    this.logPath = join(stigRoot, 'mutations.log');
  }

  dispatch(mutation: Mutation): MutationResult {
    // 1. Validate
    const validationError = validateMutation(mutation);
    if (validationError) {
      return this.fail(mutation, validationError);
    }

    // 2. Apply
    try {
      switch (mutation.type) {
        case 'CREATE_NODE':
          return this.applyCreate(mutation);
        case 'UPDATE_CONTENT':
          return this.applyUpdateContent(mutation);
        case 'UPDATE_SIGNALS':
          return this.applyUpdateSignals(mutation);
        case 'DELETE_NODE':
          return this.applyDelete(mutation);
        case 'MERGE_NODES':
          return this.applyMerge(mutation);
        default:
          return this.fail(mutation, `Unknown mutation type: ${mutation.type}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.fail(mutation, message);
    }
  }

  private applyCreate(mutation: Mutation): MutationResult {
    const { path, payload } = mutation;

    // Check for duplicate
    if (nodeExists(this.workspacePath, path)) {
      return this.fail(mutation, `Node already exists at path: ${path}`);
    }

    // Check parent exists (root always exists conceptually for top-level nodes)
    const parentPath = getParentPath(path);
    if (parentPath !== '.' && !nodeExists(this.workspacePath, parentPath)) {
      return this.fail(mutation, `Parent node does not exist: ${parentPath}`);
    }

    const node: StigNode = {
      path,
      name: payload.name ?? path,
      signals: {
        ...DEFAULT_SIGNALS,
        last_pulse: new Date().toISOString(),
        ...payload.signals,
      },
      evidence: { ...DEFAULT_EVIDENCE, ...payload.evidence },
      content: payload.content ?? '',
      isScaffold: payload.isScaffold ?? false,
    };

    writeNode(this.workspacePath, path, node);
    return this.succeed(mutation);
  }

  private applyUpdateContent(mutation: Mutation): MutationResult {
    const { path, payload } = mutation;

    if (!nodeExists(this.workspacePath, path)) {
      return this.fail(mutation, `Node does not exist: ${path}`);
    }

    const existing = readNode(this.workspacePath, path);
    if (payload.content !== undefined) {
      existing.content = payload.content;
    }
    existing.signals.last_pulse = new Date().toISOString();

    writeNode(this.workspacePath, path, existing);
    return this.succeed(mutation);
  }

  private applyUpdateSignals(mutation: Mutation): MutationResult {
    const { path, payload } = mutation;

    if (!nodeExists(this.workspacePath, path)) {
      return this.fail(mutation, `Node does not exist: ${path}`);
    }

    const existing = readNode(this.workspacePath, path);
    if (payload.signals) {
      existing.signals = {
        ...existing.signals,
        ...payload.signals,
        last_pulse: new Date().toISOString(),
      };
    }

    // Append conflict reason if provided
    if (payload.conflict_reason) {
      existing.evidence.conflict_reasons = existing.evidence.conflict_reasons ?? [];
      existing.evidence.conflict_reasons.push(payload.conflict_reason);
    }

    writeNode(this.workspacePath, path, existing);
    return this.succeed(mutation);
  }

  private applyDelete(mutation: Mutation): MutationResult {
    const { path } = mutation;

    if (path === '.' || path === '') {
      return this.fail(mutation, 'Cannot delete root node');
    }

    if (!nodeExists(this.workspacePath, path)) {
      return this.fail(mutation, `Node does not exist: ${path}`);
    }

    const fullPath = join(this.workspacePath, path);
    rmSync(fullPath, { recursive: true, force: true });
    return this.succeed(mutation);
  }

  /**
   * MERGE_NODES: Atomic operation that updates target with synthesized content
   * and deletes source nodes in one transaction.
   */
  private applyMerge(mutation: Mutation): MutationResult {
    const { path, payload } = mutation;
    const sources = payload.merge_sources ?? [];

    // Validate target exists
    if (!nodeExists(this.workspacePath, path)) {
      return this.fail(mutation, `Target node does not exist: ${path}`);
    }

    // Validate all sources exist
    for (const source of sources) {
      if (!nodeExists(this.workspacePath, source)) {
        return this.fail(mutation, `Source node does not exist: ${source}`);
      }
    }

    // 1. Update target with synthesized content and boosted signals
    const target = readNode(this.workspacePath, path);
    if (payload.content !== undefined) {
      target.content = payload.content;
    }
    if (payload.signals) {
      target.signals = {
        ...target.signals,
        ...payload.signals,
        last_pulse: new Date().toISOString(),
      };
    }
    writeNode(this.workspacePath, path, target);

    // 2. Delete all source nodes (consumed by merge)
    for (const source of sources) {
      const fullPath = join(this.workspacePath, source);
      rmSync(fullPath, { recursive: true, force: true });
    }

    return this.succeed(mutation);
  }

  private succeed(mutation: Mutation): MutationResult {
    this.log(mutation, true);
    return { success: true, mutation };
  }

  private fail(mutation: Mutation, error: string): MutationResult {
    this.log(mutation, false, error);
    return { success: false, error, mutation };
  }

  private log(mutation: Mutation, success: boolean, error?: string): void {
    const entry = formatLogEntry(mutation, success, error);
    appendFileSync(this.logPath, entry, 'utf-8');
  }
}

function getParentPath(nodePath: string): string {
  if (nodePath === '.' || nodePath === '' || nodePath === '/') return '.';
  const segments = nodePath.split('/').filter(Boolean);
  if (segments.length <= 1) return '.';
  return segments.slice(0, -1).join('/');
}
