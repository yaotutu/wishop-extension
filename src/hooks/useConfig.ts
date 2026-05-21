import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extensionApi } from '../shared/extension-api';
import type { Config } from '../shared/types';
import { queryKeys } from '../query/query-keys';

export function useConfig(accountId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.config.item(accountId),
    enabled: !!accountId,
    queryFn: () => extensionApi.config.get(accountId),
  });

  const mutation = useMutation({
    mutationFn: (newConfig: Config) => extensionApi.config.set(accountId, newConfig),
    onSuccess: (result, newConfig) => {
      if (result.success) {
        queryClient.setQueryData(queryKeys.config.item(accountId), newConfig);
      }
    },
  });

  const fetchConfig = useCallback(async () => {
    if (!accountId) return { appId: '', appSecret: '' };
    return queryClient.fetchQuery({
      queryKey: queryKeys.config.item(accountId),
      queryFn: () => extensionApi.config.get(accountId),
    });
  }, [accountId, queryClient]);
  const saveConfig = useCallback(async (newConfig: Config): Promise<{ success: boolean; error?: string }> => {
    return mutation.mutateAsync(newConfig);
  }, [mutation]);

  return { config: query.data ?? { appId: '', appSecret: '' }, loading: query.isLoading, fetchConfig, saveConfig };
}
