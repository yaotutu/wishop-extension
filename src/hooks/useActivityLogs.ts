import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extensionApi } from '../shared/extension-api';
import type { ActivityLogEntry } from '../shared/activity-log';
import { queryKeys } from '../query/query-keys';

export function useActivityLogs() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.activityLogs.list,
    queryFn: () => extensionApi.activityLogs.list(),
  });

  useEffect(() => extensionApi.activityLogs.onAdded((log) => {
    queryClient.setQueryData<ActivityLogEntry[]>(queryKeys.activityLogs.list, (current = []) => [...current, log].slice(-500));
  }), [queryClient]);

  const clearMutation = useMutation({
    mutationFn: () => extensionApi.activityLogs.clear(),
    onSuccess: () => {
      queryClient.setQueryData<ActivityLogEntry[]>(queryKeys.activityLogs.list, []);
    },
  });

  const fetchLogs = useCallback(async () => queryClient.fetchQuery({
    queryKey: queryKeys.activityLogs.list,
    queryFn: () => extensionApi.activityLogs.list(),
  }), [queryClient]);

  const clearLogs = useCallback(async () => {
    await clearMutation.mutateAsync();
  }, [clearMutation]);

  return { logs: query.data ?? [], loading: query.isLoading, fetchLogs, clearLogs };
}
