import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extensionApi } from '../shared/extension-api';
import type { GlobalLogEntry } from '../shared/global-log';
import { queryKeys } from '../query/query-keys';

export function useGlobalLogs() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.globalLogs.list,
    queryFn: () => extensionApi.globalLogs.list(),
  });

  useEffect(() => extensionApi.globalLogs.onAdded((log) => {
    queryClient.setQueryData<GlobalLogEntry[]>(queryKeys.globalLogs.list, (current = []) => [...current, log].slice(-500));
  }), [queryClient]);

  const clearMutation = useMutation({
    mutationFn: () => extensionApi.globalLogs.clear(),
    onSuccess: () => {
      queryClient.setQueryData<GlobalLogEntry[]>(queryKeys.globalLogs.list, []);
    },
  });

  const fetchLogs = useCallback(async () => queryClient.fetchQuery({
    queryKey: queryKeys.globalLogs.list,
    queryFn: () => extensionApi.globalLogs.list(),
  }), [queryClient]);

  const clearLogs = useCallback(async () => {
    await clearMutation.mutateAsync();
  }, [clearMutation]);

  return { logs: query.data ?? [], loading: query.isLoading, fetchLogs, clearLogs };
}
