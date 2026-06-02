import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extensionApi } from '../shared/extension-api';
import type {
  AccountScheduledJob,
  AccountScheduledJobInput,
  GlobalScheduledJob,
  GlobalScheduledJobInput,
  ScheduledJob,
  ScheduledJobView,
  ProductAuditTaskConfig,
} from '../shared/types';
import { queryKeys } from '../query/query-keys';

export type ProductAuditScheduledJob =
  | (AccountScheduledJob<ProductAuditTaskConfig> & { nextRunAt: number | null })
  | (GlobalScheduledJob<ProductAuditTaskConfig> & { nextRunAt: number | null });
type AccountProductAuditScheduledJob = Extract<ProductAuditScheduledJob, { scope: 'account' }>;
type GlobalProductAuditScheduledJob = Extract<ProductAuditScheduledJob, { scope: 'global' }>;
type AccountProductAuditJobInput = AccountScheduledJobInput<ProductAuditTaskConfig>;
type GlobalProductAuditJobInput = GlobalScheduledJobInput<ProductAuditTaskConfig>;

const defaultProductAuditConfig: ProductAuditTaskConfig = {
  submitUnauditedDrafts: true,
  submitLimit: 0,
};

function isProductAuditJob(job: ScheduledJobView): job is ProductAuditScheduledJob {
  return job.jobType === 'productAudit.submitDrafts';
}

function isAccountProductAuditJob(job: ProductAuditScheduledJob, accountId: string): job is AccountProductAuditScheduledJob {
  return job.scope === 'account' && job.accountId === accountId;
}

function isGlobalProductAuditJob(job: ProductAuditScheduledJob): job is GlobalProductAuditScheduledJob {
  return job.scope === 'global';
}

export function useSchedulers(accountId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.scheduledJobs.accountProductAudit(accountId),
    enabled: !!accountId,
    queryFn: async () => (await extensionApi.scheduledJobs.list())
      .filter(isProductAuditJob)
      .filter(job => isAccountProductAuditJob(job, accountId)),
  });

  const fetchTasks = useCallback(async () => {
    if (!accountId) return [];
    return queryClient.fetchQuery({
      queryKey: queryKeys.scheduledJobs.accountProductAudit(accountId),
      queryFn: async () => (await extensionApi.scheduledJobs.list())
        .filter(isProductAuditJob)
        .filter(job => isAccountProductAuditJob(job, accountId)),
    });
  }, [accountId, queryClient]);

  const addMutation = useMutation({
    mutationFn: (job: AccountProductAuditJobInput) => extensionApi.scheduledJobs.add(job),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.list });
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.accountProductAudit(accountId) });
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ jobId, patch }: { jobId: string; patch: Partial<ProductAuditScheduledJob> }) =>
      extensionApi.scheduledJobs.update(jobId, patch as Partial<ScheduledJob>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.list });
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.accountProductAudit(accountId) });
    },
  });
  const removeMutation = useMutation({
    mutationFn: (jobId: string) => extensionApi.scheduledJobs.remove(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.list });
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.accountProductAudit(accountId) });
    },
  });

  const addTask = useCallback(async (job: AccountProductAuditJobInput): Promise<ScheduledJob> => {
    return addMutation.mutateAsync(job);
  }, [addMutation]);

  const updateTask = useCallback(async (jobId: string, patch: Partial<ProductAuditScheduledJob>) => {
    await updateMutation.mutateAsync({ jobId, patch });
  }, [updateMutation]);

  const removeTask = useCallback(async (jobId: string) => {
    await removeMutation.mutateAsync(jobId);
  }, [removeMutation]);

  return { tasks: query.data ?? [], loading: query.isLoading, fetchTasks, addTask, updateTask, removeTask, defaultProductAuditConfig };
}

export function useGlobalSchedulers() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.scheduledJobs.globalProductAudit,
    queryFn: async () => (await extensionApi.scheduledJobs.list())
      .filter(isProductAuditJob)
      .filter(isGlobalProductAuditJob),
  });

  const fetchTasks = useCallback(async () => queryClient.fetchQuery({
    queryKey: queryKeys.scheduledJobs.globalProductAudit,
    queryFn: async () => (await extensionApi.scheduledJobs.list())
      .filter(isProductAuditJob)
      .filter(isGlobalProductAuditJob),
  }), [queryClient]);

  const addMutation = useMutation({
    mutationFn: (job: GlobalProductAuditJobInput) => extensionApi.scheduledJobs.add(job),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.list });
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.globalProductAudit });
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ jobId, patch }: { jobId: string; patch: Partial<ProductAuditScheduledJob> }) =>
      extensionApi.scheduledJobs.update(jobId, patch as Partial<ScheduledJob>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.list });
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.globalProductAudit });
    },
  });
  const removeMutation = useMutation({
    mutationFn: (jobId: string) => extensionApi.scheduledJobs.remove(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.list });
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.globalProductAudit });
    },
  });

  const addTask = useCallback(async (job: GlobalProductAuditJobInput): Promise<ScheduledJob> => {
    return addMutation.mutateAsync(job);
  }, [addMutation]);

  const updateTask = useCallback(async (jobId: string, patch: Partial<ProductAuditScheduledJob>) => {
    await updateMutation.mutateAsync({ jobId, patch });
  }, [updateMutation]);

  const removeTask = useCallback(async (jobId: string) => {
    await removeMutation.mutateAsync(jobId);
  }, [removeMutation]);

  return { tasks: query.data ?? [], loading: query.isLoading, fetchTasks, addTask, updateTask, removeTask };
}
