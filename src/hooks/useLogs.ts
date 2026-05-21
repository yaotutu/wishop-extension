import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extensionApi } from '../shared/extension-api';
import type { LogEntry } from '../shared/types';
import { queryKeys } from '../query/query-keys';

export function useLogs(accountId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.logs.list(accountId),
    enabled: !!accountId,
    queryFn: () => extensionApi.logs.get(accountId),
  });

  const clearMutation = useMutation({
    mutationFn: () => extensionApi.logs.clear(accountId),
    onSuccess: () => {
      queryClient.setQueryData<LogEntry[]>(queryKeys.logs.list(accountId), []);
    },
  });

  const fetchLogs = useCallback(async () => {
    if (!accountId) return [];
    return queryClient.fetchQuery({
      queryKey: queryKeys.logs.list(accountId),
      queryFn: () => extensionApi.logs.get(accountId),
    });
  }, [accountId, queryClient]);

  const clearLogs = useCallback(async () => {
    if (!accountId) return;
    await clearMutation.mutateAsync();
  }, [accountId, clearMutation]);

  return { logs: query.data ?? [], loading: query.isLoading, fetchLogs, clearLogs };
}
