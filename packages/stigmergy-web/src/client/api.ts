import type {
  WorkspaceInfo,
  StatusResponse,
  ConfigResponse,
  VizNode,
  NodeDetail,
  InitRequest,
  RunRequest,
  RunStatus,
} from '../shared/types';
import type { TelemetryEvent } from '@hierophage/stigmergy';

const BASE = '/api';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json() as Promise<T>;
}

// Workspace
export const getWorkspace = () => fetchJson<WorkspaceInfo>('/workspace');
export const initWorkspace = (body: InitRequest) =>
  fetchJson<{ success: boolean; nodeCount: number }>('/workspace/init', {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const clearWorkspace = () =>
  fetchJson<{ success: boolean }>('/workspace', { method: 'DELETE' });

// Config
export const getConfig = () => fetchJson<ConfigResponse>('/config');
export const updateConfig = (body: Partial<ConfigResponse>) =>
  fetchJson<ConfigResponse>('/config', { method: 'PUT', body: JSON.stringify(body) });

// Tree
export const getTree = () => fetchJson<VizNode | null>('/tree');
export const getStatus = () => fetchJson<StatusResponse | null>('/status');
export const getNode = (path: string) => fetchJson<NodeDetail>(`/nodes/${path}`);
export const updateNodeSignals = (path: string, signals: Partial<{ need: number; confidence: number; conflict: number }>) =>
  fetchJson<{ success: boolean }>(`/nodes/${path}/signals`, {
    method: 'POST',
    body: JSON.stringify(signals),
  });

// Run
export const startRun = (body: RunRequest) =>
  fetchJson<{ success: boolean }>('/run', { method: 'POST', body: JSON.stringify(body) });
export const stopRun = () =>
  fetchJson<{ success: boolean }>('/run/stop', { method: 'POST' });
export const getRunStatus = () => fetchJson<RunStatus>('/run/status');

// Replay
export const getReplay = () => fetchJson<TelemetryEvent[]>('/replay');
export const getReplaySummary = () => fetchJson<Record<string, unknown> | null>('/replay/summary');
