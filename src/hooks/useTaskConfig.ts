import { useCallback } from 'react';
import { extensionApi } from '../shared/extension-api';
import type { TaskConfig, TaskCycleResult } from '../shared/types';
import { useIpcFetch } from './useIpcFetch';

export function useTaskConfig(accountId: string) {
  const { data: taskConfig, loading, fetch: fetchTaskConfig, setData: setTaskConfigState } = useIpcFetch<TaskConfig>(
    accountId,
    useCallback(async () => extensionApi.taskConfig.get(accountId), [accountId]),
    { listUnreviewed: true, listUnreviewedQuantity: 0, autoDeleteFailed: true },
  );

  const saveTaskConfig = useCallback(async (config: TaskConfig) => {
    if (!accountId) return;
    await extensionApi.taskConfig.set(accountId, config);
    setTaskConfigState(config);
  }, [accountId, setTaskConfigState]);

  const runTask = useCallback(async (config: TaskConfig): Promise<TaskCycleResult> => {
    return extensionApi.task.run(accountId, config);
  }, [accountId]);

  return { taskConfig, loading, fetchTaskConfig, saveTaskConfig, runTask };
}
