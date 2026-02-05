import type { Mutation, MutationType, MutationPayload } from '../types.js';

/**
 * Create a typed mutation object.
 */
export function createMutation(
  type: MutationType,
  path: string,
  payload: MutationPayload = {},
): Mutation {
  return {
    type,
    path,
    payload,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Validate a mutation before dispatch.
 * Returns an error message or null if valid.
 */
export function validateMutation(mutation: Mutation): string | null {
  if (!mutation.type) {
    return 'Mutation type is required';
  }

  if (!mutation.path && mutation.path !== '.') {
    return 'Mutation path is required';
  }

  const validTypes: MutationType[] = [
    'CREATE_NODE',
    'UPDATE_CONTENT',
    'UPDATE_SIGNALS',
    'DELETE_NODE',
    'MERGE_NODES',
  ];
  if (!validTypes.includes(mutation.type)) {
    return `Invalid mutation type: ${mutation.type}`;
  }

  if (mutation.type === 'CREATE_NODE') {
    if (!mutation.payload.name) {
      return 'CREATE_NODE requires a name in payload';
    }
  }

  if (mutation.type === 'UPDATE_SIGNALS') {
    if (!mutation.payload.signals) {
      return 'UPDATE_SIGNALS requires signals in payload';
    }
  }

  if (mutation.type === 'MERGE_NODES') {
    if (!mutation.payload.merge_sources || mutation.payload.merge_sources.length === 0) {
      return 'MERGE_NODES requires merge_sources in payload';
    }
  }

  return null;
}

/**
 * Format a mutation for the append-only log.
 */
export function formatLogEntry(mutation: Mutation, success: boolean, error?: string): string {
  const status = success ? 'OK' : 'ERR';
  const errSuffix = error ? ` error="${error}"` : '';
  return `[${mutation.timestamp}] ${status} ${mutation.type} path="${mutation.path}"${errSuffix}\n`;
}
