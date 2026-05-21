import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extensionApi } from '../shared/extension-api';
import type { TaskConfig, TaskCycleResult } from '../shared/types';
import { queryKeys } from '../query/query-keys';

const defaultTaskConfig: TaskConfig = {
  listUnreviewed: true,
  listUnreviewedQuantity: 0,
  autoDeleteFailed: true,
};

export function useTaskConfig(accountId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.taskConfig.item(accountId),
    enabled: !!accountId,
    queryFn: () => extensionApi.taskConfig.get(accountId),
  });

  const saveMutation = useMutation({
    mutationFn: (config: TaskConfig) => extensionApi.taskConfig.set(accountId, config),
    onSuccess: (_result, config) => {
      queryClient.setQueryData(queryKeys.taskConfig.item(accountId), config);
    },
  });

  const fetchTaskConfig = useCallback(async () => {
    if (!accountId) return defaultTaskConfig;
    return queryClient.fetchQuery({
      queryKey: queryKeys.taskConfig.item(accountId),
      queryFn: () => extensionApi.taskConfig.get(accountId),
    });
  }, [accountId, queryClient]);

  const saveTaskConfig = useCallback(async (config: TaskConfig) => {
    if (!accountId) return;
    await saveMutation.mutateAsync(config);
  }, [accountId, saveMutation]);

  const runTask = useCallback(async (config: TaskConfig): Promise<TaskCycleResult> => {
    return extensionApi.task.run(accountId, config);
  }, [accountId]);

  return { taskConfig: query.data ?? defaultTaskConfig, loading: query.isLoading, fetchTaskConfig, saveTaskConfig, runTask };
}
