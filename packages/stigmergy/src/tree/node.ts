import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { StigNode, NodeSignals, NodeEvidence } from '../types.js';
import { DEFAULT_SIGNALS, DEFAULT_EVIDENCE } from '../types.js';

const NODE_FILE = '_node.md';
const ROOT_FILE = 'root.md';

/**
 * Parse a _node.md file into a StigNode.
 * Format: YAML frontmatter between --- delimiters, then markdown body.
 */
export function parseNode(filePath: string, relativePath: string): StigNode {
  const raw = readFileSync(filePath, 'utf-8');
  return parseNodeContent(raw, relativePath);
}

/**
 * Parse raw _node.md content into a StigNode (no filesystem access).
 */
export function parseNodeContent(raw: string, relativePath: string): StigNode {
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!frontmatterMatch) {
    // No frontmatter — treat entire content as body with defaults
    return {
      path: relativePath,
      name: basename(relativePath) || 'root',
      signals: { ...DEFAULT_SIGNALS, last_pulse: new Date().toISOString() },
      evidence: { ...DEFAULT_EVIDENCE },
      content: raw.trim(),
      isScaffold: false,
    };
  }

  const frontmatter = parseYaml(frontmatterMatch[1]) as Record<string, unknown>;
  const body = frontmatterMatch[2].trim();

  const signals: NodeSignals = {
    need: asNumber(frontmatter['need'], DEFAULT_SIGNALS.need),
    confidence: asNumber(frontmatter['confidence'], DEFAULT_SIGNALS.confidence),
    conflict: asNumber(frontmatter['conflict'], DEFAULT_SIGNALS.conflict),
    workers_active: asNumber(frontmatter['workers_active'], DEFAULT_SIGNALS.workers_active),
    last_pulse: asString(frontmatter['last_pulse'], new Date().toISOString()),
  };

  const evidence: NodeEvidence = {
    acceptance_criteria: asNumber(frontmatter['acceptance_criteria'], DEFAULT_EVIDENCE.acceptance_criteria),
    examples: asNumber(frontmatter['examples'], DEFAULT_EVIDENCE.examples),
    risks: asNumber(frontmatter['risks'], DEFAULT_EVIDENCE.risks),
  };

  return {
    path: relativePath,
    name: asString(frontmatter['name'], basename(relativePath) || 'root'),
    signals,
    evidence,
    content: body,
    isScaffold: asBoolean(frontmatter['scaffold'], false),
  };
}

/**
 * Serialize a StigNode to _node.md format.
 */
export function serializeNode(node: StigNode): string {
  const frontmatter: Record<string, unknown> = {
    name: node.name,
    need: node.signals.need,
    confidence: node.signals.confidence,
    conflict: node.signals.conflict,
    workers_active: node.signals.workers_active,
    last_pulse: node.signals.last_pulse,
    acceptance_criteria: node.evidence.acceptance_criteria,
    examples: node.evidence.examples,
    risks: node.evidence.risks,
  };

  if (node.isScaffold) {
    frontmatter['scaffold'] = true;
  }

  const yaml = stringifyYaml(frontmatter).trim();
  const body = node.content.trim();

  return `---\n${yaml}\n---\n${body ? `\n${body}\n` : '\n'}`
}

/**
 * Read a node from the workspace.
 * If nodePath is '.' or '', reads root.md. Otherwise reads nodePath/_node.md.
 */
export function readNode(workspacePath: string, nodePath: string): StigNode {
  if (isRootPath(nodePath)) {
    const filePath = join(workspacePath, ROOT_FILE);
    return parseNode(filePath, '.');
  }

  const filePath = join(workspacePath, nodePath, NODE_FILE);
  return parseNode(filePath, nodePath);
}

/**
 * Write a node to the workspace.
 */
export function writeNode(workspacePath: string, nodePath: string, node: StigNode): void {
  const serialized = serializeNode(node);

  if (isRootPath(nodePath)) {
    writeFileSync(join(workspacePath, ROOT_FILE), serialized, 'utf-8');
    return;
  }

  const dirPath = join(workspacePath, nodePath);
  mkdirSync(dirPath, { recursive: true });
  writeFileSync(join(dirPath, NODE_FILE), serialized, 'utf-8');
}

/**
 * List child nodes (subdirectories containing _node.md).
 */
export function listChildren(workspacePath: string, nodePath: string): string[] {
  const dirPath = isRootPath(nodePath)
    ? workspacePath
    : join(workspacePath, nodePath);

  if (!existsSync(dirPath)) return [];

  const entries = readdirSync(dirPath);
  const children: string[] = [];

  for (const entry of entries) {
    const entryPath = join(dirPath, entry);
    if (statSync(entryPath).isDirectory()) {
      const nodeFile = join(entryPath, NODE_FILE);
      if (existsSync(nodeFile)) {
        const childRelPath = isRootPath(nodePath) ? entry : join(nodePath, entry);
        children.push(childRelPath);
      }
    }
  }

  return children.sort();
}

/**
 * Check if a node exists at the given path.
 */
export function nodeExists(workspacePath: string, nodePath: string): boolean {
  if (isRootPath(nodePath)) {
    return existsSync(join(workspacePath, ROOT_FILE));
  }
  return existsSync(join(workspacePath, nodePath, NODE_FILE));
}

function isRootPath(nodePath: string): boolean {
  return nodePath === '.' || nodePath === '' || nodePath === '/';
}

function asNumber(val: unknown, fallback: number): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = Number(val);
    if (!isNaN(n)) return n;
  }
  return fallback;
}

function asString(val: unknown, fallback: string): string {
  if (typeof val === 'string') return val;
  return fallback;
}

function asBoolean(val: unknown, fallback: boolean): boolean {
  if (typeof val === 'boolean') return val;
  return fallback;
}
