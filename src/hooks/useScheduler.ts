import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extensionApi } from '../shared/extension-api';
import type { GlobalScheduledTask, ScheduledTask, TaskConfig } from '../shared/types';
import { queryKeys } from '../query/query-keys';

const defaultTaskConfig: TaskConfig = {
  listUnreviewed: true,
  listUnreviewedQuantity: 0,
  autoDeleteFailed: true,
};

export function useSchedulers(accountId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.scheduler.list(accountId),
    enabled: !!accountId,
    queryFn: () => extensionApi.scheduler.list(accountId),
  });

  const fetchTasks = useCallback(async () => {
    if (!accountId) return [];
    return queryClient.fetchQuery({
      queryKey: queryKeys.scheduler.list(accountId),
      queryFn: () => extensionApi.scheduler.list(accountId),
    });
  }, [accountId, queryClient]);

  const addMutation = useMutation({
    mutationFn: (task: { name: string; enabled: boolean; cronExpression: string; dailyLimit: number; taskConfig: TaskConfig }) =>
      extensionApi.scheduler.add(accountId, task),
    onSuccess: (newTask) => {
      queryClient.setQueryData<ScheduledTask[]>(queryKeys.scheduler.list(accountId), (current = []) => [...current, newTask]);
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ taskId, patch }: { taskId: string; patch: Partial<ScheduledTask> }) => extensionApi.scheduler.update(accountId, taskId, patch),
    onSuccess: (_result, { taskId, patch }) => {
      queryClient.setQueryData<ScheduledTask[]>(queryKeys.scheduler.list(accountId), (current = []) =>
        current.map(t => t.id === taskId ? { ...t, ...patch } : t),
      );
    },
  });
  const removeMutation = useMutation({
    mutationFn: (taskId: string) => extensionApi.scheduler.remove(accountId, taskId),
    onSuccess: (_result, taskId) => {
      queryClient.setQueryData<ScheduledTask[]>(queryKeys.scheduler.list(accountId), (current = []) => current.filter(t => t.id !== taskId));
    },
  });

  const addTask = useCallback(async (task: { name: string; enabled: boolean; cronExpression: string; dailyLimit: number; taskConfig: TaskConfig }): Promise<ScheduledTask> => {
    return addMutation.mutateAsync(task);
  }, [addMutation]);

  const updateTask = useCallback(async (taskId: string, patch: Partial<ScheduledTask>) => {
    await updateMutation.mutateAsync({ taskId, patch });
  }, [updateMutation]);

  const removeTask = useCallback(async (taskId: string) => {
    await removeMutation.mutateAsync(taskId);
  }, [removeMutation]);

  return { tasks: query.data ?? [], loading: query.isLoading, fetchTasks, addTask, updateTask, removeTask, defaultTaskConfig };
}

export function useGlobalSchedulers() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.scheduler.globalList,
    queryFn: () => extensionApi.globalScheduler.list(),
  });

  const fetchTasks = useCallback(async () => queryClient.fetchQuery({
    queryKey: queryKeys.scheduler.globalList,
    queryFn: () => extensionApi.globalScheduler.list(),
  }), [queryClient]);

  const addMutation = useMutation({
    mutationFn: (task: Omit<GlobalScheduledTask, 'id' | 'accountStats'>) => extensionApi.globalScheduler.add(task),
    onSuccess: (newTask) => {
      queryClient.setQueryData<GlobalScheduledTask[]>(queryKeys.scheduler.globalList, (current = []) => [...current, newTask]);
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ taskId, patch }: { taskId: string; patch: Partial<GlobalScheduledTask> }) => extensionApi.globalScheduler.update(taskId, patch),
    onSuccess: (_result, { taskId, patch }) => {
      queryClient.setQueryData<GlobalScheduledTask[]>(queryKeys.scheduler.globalList, (current = []) =>
        current.map(t => t.id === taskId ? { ...t, ...patch } : t),
      );
    },
  });
  const removeMutation = useMutation({
    mutationFn: (taskId: string) => extensionApi.globalScheduler.remove(taskId),
    onSuccess: (_result, taskId) => {
      queryClient.setQueryData<GlobalScheduledTask[]>(queryKeys.scheduler.globalList, (current = []) => current.filter(t => t.id !== taskId));
    },
  });

  const addTask = useCallback(async (task: Omit<GlobalScheduledTask, 'id' | 'accountStats'>): Promise<GlobalScheduledTask> => {
    return addMutation.mutateAsync(task);
  }, [addMutation]);

  const updateTask = useCallback(async (taskId: string, patch: Partial<GlobalScheduledTask>) => {
    await updateMutation.mutateAsync({ taskId, patch });
  }, [updateMutation]);

  const removeTask = useCallback(async (taskId: string) => {
    await removeMutation.mutateAsync(taskId);
  }, [removeMutation]);

  return { tasks: query.data ?? [], loading: query.isLoading, fetchTasks, addTask, updateTask, removeTask };
}
