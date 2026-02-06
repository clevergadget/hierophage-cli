import { useState, useEffect, useCallback } from 'react';
import { getWorkspace } from '../api';
import type { WorkspaceInfo } from '../../shared/types';

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getWorkspace();
      setWorkspace(data);
    } catch {
      setWorkspace({ exists: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { workspace, loading, refresh };
}
