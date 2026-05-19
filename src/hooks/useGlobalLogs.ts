import { useCallback, useEffect } from 'react';
import { extensionApi } from '../shared/extension-api';
import type { GlobalLogEntry } from '../shared/global-log';
import { useIpcFetch } from './useIpcFetch';

export function useGlobalLogs() {
  const { data: logs, loading, fetch: fetchLogs, setData: setLogs } = useIpcFetch<GlobalLogEntry[]>(
    'globalLogs',
    useCallback(async () => extensionApi.globalLogs.list(), []),
    [],
  );

  useEffect(() => extensionApi.globalLogs.onAdded((log) => {
    setLogs(prev => [...prev, log].slice(-500));
  }), [setLogs]);

  const clearLogs = useCallback(async () => {
    await extensionApi.globalLogs.clear();
    setLogs([]);
  }, [setLogs]);

  return { logs, loading, fetchLogs, clearLogs };
}
