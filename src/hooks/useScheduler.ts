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
  TaskConfig,
} from '../shared/types';
import { queryKeys } from '../query/query-keys';

export type ListingScheduledJob =
  | (AccountScheduledJob<TaskConfig> & { nextRunAt: number | null })
  | (GlobalScheduledJob<TaskConfig> & { nextRunAt: number | null });
type AccountListingScheduledJob = Extract<ListingScheduledJob, { scope: 'account' }>;
type GlobalListingScheduledJob = Extract<ListingScheduledJob, { scope: 'global' }>;
type AccountListingJobInput = AccountScheduledJobInput<TaskConfig>;
type GlobalListingJobInput = GlobalScheduledJobInput<TaskConfig>;

const defaultTaskConfig: TaskConfig = {
  listUnreviewed: true,
  listUnreviewedQuantity: 0,
  autoDeleteFailed: true,
};

function isListingJob(job: ScheduledJobView): job is ListingScheduledJob {
  return job.jobType === 'listing.submitDrafts';
}

function isAccountListingJob(job: ListingScheduledJob, accountId: string): job is AccountListingScheduledJob {
  return job.scope === 'account' && job.accountId === accountId;
}

function isGlobalListingJob(job: ListingScheduledJob): job is GlobalListingScheduledJob {
  return job.scope === 'global';
}

export function useSchedulers(accountId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.scheduledJobs.accountListing(accountId),
    enabled: !!accountId,
    queryFn: async () => (await extensionApi.scheduledJobs.list())
      .filter(isListingJob)
      .filter(job => isAccountListingJob(job, accountId)),
  });

  const fetchTasks = useCallback(async () => {
    if (!accountId) return [];
    return queryClient.fetchQuery({
      queryKey: queryKeys.scheduledJobs.accountListing(accountId),
      queryFn: async () => (await extensionApi.scheduledJobs.list())
        .filter(isListingJob)
        .filter(job => isAccountListingJob(job, accountId)),
    });
  }, [accountId, queryClient]);

  const addMutation = useMutation({
    mutationFn: (job: AccountListingJobInput) => extensionApi.scheduledJobs.add(job),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.list });
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.accountListing(accountId) });
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ jobId, patch }: { jobId: string; patch: Partial<ListingScheduledJob> }) =>
      extensionApi.scheduledJobs.update(jobId, patch as Partial<ScheduledJob>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.list });
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.accountListing(accountId) });
    },
  });
  const removeMutation = useMutation({
    mutationFn: (jobId: string) => extensionApi.scheduledJobs.remove(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.list });
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.accountListing(accountId) });
    },
  });

  const addTask = useCallback(async (job: AccountListingJobInput): Promise<ScheduledJob> => {
    return addMutation.mutateAsync(job);
  }, [addMutation]);

  const updateTask = useCallback(async (jobId: string, patch: Partial<ListingScheduledJob>) => {
    await updateMutation.mutateAsync({ jobId, patch });
  }, [updateMutation]);

  const removeTask = useCallback(async (jobId: string) => {
    await removeMutation.mutateAsync(jobId);
  }, [removeMutation]);

  return { tasks: query.data ?? [], loading: query.isLoading, fetchTasks, addTask, updateTask, removeTask, defaultTaskConfig };
}

export function useGlobalSchedulers() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.scheduledJobs.globalListing,
    queryFn: async () => (await extensionApi.scheduledJobs.list())
      .filter(isListingJob)
      .filter(isGlobalListingJob),
  });

  const fetchTasks = useCallback(async () => queryClient.fetchQuery({
    queryKey: queryKeys.scheduledJobs.globalListing,
    queryFn: async () => (await extensionApi.scheduledJobs.list())
      .filter(isListingJob)
      .filter(isGlobalListingJob),
  }), [queryClient]);

  const addMutation = useMutation({
    mutationFn: (job: GlobalListingJobInput) => extensionApi.scheduledJobs.add(job),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.list });
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.globalListing });
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ jobId, patch }: { jobId: string; patch: Partial<ListingScheduledJob> }) =>
      extensionApi.scheduledJobs.update(jobId, patch as Partial<ScheduledJob>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.list });
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.globalListing });
    },
  });
  const removeMutation = useMutation({
    mutationFn: (jobId: string) => extensionApi.scheduledJobs.remove(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.list });
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.globalListing });
    },
  });

  const addTask = useCallback(async (job: GlobalListingJobInput): Promise<ScheduledJob> => {
    return addMutation.mutateAsync(job);
  }, [addMutation]);

  const updateTask = useCallback(async (jobId: string, patch: Partial<ListingScheduledJob>) => {
    await updateMutation.mutateAsync({ jobId, patch });
  }, [updateMutation]);

  const removeTask = useCallback(async (jobId: string) => {
    await removeMutation.mutateAsync(jobId);
  }, [removeMutation]);

  return { tasks: query.data ?? [], loading: query.isLoading, fetchTasks, addTask, updateTask, removeTask };
}
