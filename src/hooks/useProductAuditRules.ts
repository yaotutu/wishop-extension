import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extensionApi } from '../shared/extension-api';
import type { ProductAuditFailureRule } from '../shared/types';
import { queryKeys } from '../query/query-keys';

export function useProductAuditRules() {
  const queryClient = useQueryClient();
  const rulesQuery = useQuery({
    queryKey: queryKeys.productAuditRules.failure,
    queryFn: () => extensionApi.productAudit.getFailureRules(),
  });
  const defaultsQuery = useQuery({
    queryKey: queryKeys.productAuditRules.failureDefaults,
    queryFn: () => extensionApi.productAudit.getDefaultFailureRules(),
  });
  const saveMutation = useMutation({
    mutationFn: (newRules: ProductAuditFailureRule[]) => extensionApi.productAudit.setFailureRules(newRules),
    onSuccess: (_result, newRules) => {
      queryClient.setQueryData(queryKeys.productAuditRules.failure, newRules);
    },
  });

  const fetchRules = useCallback(async () => queryClient.fetchQuery({
    queryKey: queryKeys.productAuditRules.failure,
    queryFn: () => extensionApi.productAudit.getFailureRules(),
  }), [queryClient]);

  const saveRules = useCallback(async (newRules: ProductAuditFailureRule[]): Promise<void> => {
    await saveMutation.mutateAsync(newRules);
  }, [saveMutation]);

  return {
    rules: rulesQuery.data ?? [],
    defaultRules: defaultsQuery.data ?? [],
    loading: rulesQuery.isLoading || defaultsQuery.isLoading,
    fetchRules,
    saveRules,
  };
}

