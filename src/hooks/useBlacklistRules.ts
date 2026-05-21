import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extensionApi } from '../shared/extension-api';
import type { BlacklistRule } from '../shared/types';
import { queryKeys } from '../query/query-keys';

export function useBlacklistRules() {
  const queryClient = useQueryClient();
  const rulesQuery = useQuery({
    queryKey: queryKeys.rules.blacklist,
    queryFn: () => extensionApi.blacklistRules.get(),
  });
  const defaultCodesQuery = useQuery({
    queryKey: queryKeys.rules.blacklistDefaultCodes,
    queryFn: () => extensionApi.blacklistRules.getDefaultCodes(),
    select: codes => new Set(codes),
  });
  const saveMutation = useMutation({
    mutationFn: (newRules: BlacklistRule[]) => extensionApi.blacklistRules.set(newRules),
    onSuccess: (_result, newRules) => {
      queryClient.setQueryData(queryKeys.rules.blacklist, newRules);
    },
  });

  const fetchRules = useCallback(async () => queryClient.fetchQuery({
    queryKey: queryKeys.rules.blacklist,
    queryFn: () => extensionApi.blacklistRules.get(),
  }), [queryClient]);

  const saveRules = useCallback(async (newRules: BlacklistRule[]): Promise<void> => {
    await saveMutation.mutateAsync(newRules);
  }, [saveMutation]);

  return {
    rules: rulesQuery.data ?? [],
    loading: rulesQuery.isLoading || defaultCodesQuery.isLoading,
    fetchRules,
    saveRules,
    defaultCodes: defaultCodesQuery.data ?? new Set<number>(),
  };
}
