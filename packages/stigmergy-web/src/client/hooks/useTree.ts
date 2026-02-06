import { useState, useEffect, useCallback } from 'react';
import { getTree, getStatus } from '../api';
import type { VizNode, StatusResponse } from '../../shared/types';

export function useTree(refreshInterval = 0) {
  const [tree, setTree] = useState<VizNode | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [treeData, statusData] = await Promise.all([getTree(), getStatus()]);
      setTree(treeData);
      setStatus(statusData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tree');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    if (refreshInterval > 0) {
      const interval = setInterval(refresh, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refresh, refreshInterval]);

  return { tree, status, loading, error, refresh };
}
