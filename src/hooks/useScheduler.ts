import { useCallback } from 'react';
import { extensionApi } from '../shared/extension-api';
import type { ScheduledTask, TaskConfig } from '../shared/types';
import { useIpcFetch } from './useIpcFetch';

const defaultTaskConfig: TaskConfig = {
  listUnreviewed: true,
  listUnreviewedQuantity: 0,
  autoDeleteFailed: true,
};

export function useSchedulers(accountId: string) {
  const { data: tasks, loading, fetch: fetchTasks, setData: setTasks } = useIpcFetch<ScheduledTask[]>(
    accountId,
    useCallback(async () => extensionApi.scheduler.list(accountId), [accountId]),
    [],
  );

  const addTask = useCallback(async (task: { name: string; enabled: boolean; cronExpression: string; dailyLimit: number; taskConfig: TaskConfig }): Promise<ScheduledTask> => {
    const newTask = await extensionApi.scheduler.add(accountId, task);
    setTasks(prev => [...prev, newTask]);
    return newTask;
  }, [accountId, setTasks]);

  const updateTask = useCallback(async (taskId: string, patch: Partial<ScheduledTask>) => {
    await extensionApi.scheduler.update(accountId, taskId, patch);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t));
  }, [accountId, setTasks]);

  const removeTask = useCallback(async (taskId: string) => {
    await extensionApi.scheduler.remove(accountId, taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }, [accountId, setTasks]);

  return { tasks, loading, fetchTasks, addTask, updateTask, removeTask, defaultTaskConfig };
}
