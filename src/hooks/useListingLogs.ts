import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extensionApi } from '../shared/extension-api';
import type { LogEntry } from '../shared/types';
import { queryKeys } from '../query/query-keys';

function mergeLog(current: LogEntry[] | undefined, incoming: LogEntry): LogEntry[] {
  const logs = current ?? [];
  if (logs.some(log => log.id === incoming.id)) return logs;
  return [...logs, incoming].sort((a, b) => a.timestamp - b.timestamp);
}

export function useListingLogs(accountId: string) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.listingLogs.list(accountId);
  const query = useQuery({
    queryKey,
    enabled: !!accountId,
    queryFn: () => extensionApi.listingLogs.get(accountId),
  });

  useEffect(() => {
    if (!accountId) return;
    return extensionApi.listingLogs.onAdded(accountId, log => {
      queryClient.setQueryData<LogEntry[]>(queryKeys.listingLogs.list(accountId), current => mergeLog(current, log));
    });
  }, [accountId, queryClient]);

  const clearMutation = useMutation({
    mutationFn: () => extensionApi.listingLogs.clear(accountId),
    onSuccess: () => {
      queryClient.setQueryData<LogEntry[]>(queryKey, []);
    },
  });

  const fetchLogs = useCallback(async () => {
    if (!accountId) return [];
    const logs = await extensionApi.listingLogs.get(accountId);
    queryClient.setQueryData<LogEntry[]>(queryKeys.listingLogs.list(accountId), logs);
    return logs;
  }, [accountId, queryClient]);

  const clearLogs = useCallback(async () => {
    if (!accountId) return;
    await clearMutation.mutateAsync();
  }, [accountId, clearMutation]);

  return { logs: query.data ?? [], loading: query.isLoading, fetchLogs, clearLogs };
}
