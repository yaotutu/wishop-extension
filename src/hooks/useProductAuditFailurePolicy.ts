import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extensionApi } from '../shared/extension-api';
import type { ProductAuditFailurePolicy } from '../shared/types';
import { queryKeys } from '../query/query-keys';

const fallbackPolicy: ProductAuditFailurePolicy = {
  rules: [],
  defaultAction: 'deleteDraft',
};

function normalizeProductAuditFailurePolicy(policy: ProductAuditFailurePolicy): ProductAuditFailurePolicy {
  return {
    rules: policy.rules.filter(rule => rule.action !== 'deleteDraft'),
    defaultAction: 'deleteDraft',
  };
}

export function useProductAuditFailurePolicy(enabled = true) {
  const queryClient = useQueryClient();
  const policyQuery = useQuery({
    queryKey: queryKeys.productAuditFailurePolicy.item,
    enabled,
    queryFn: () => extensionApi.productAudit.getFailurePolicy(),
  });
  const defaultsQuery = useQuery({
    queryKey: queryKeys.productAuditFailurePolicy.defaults,
    enabled,
    queryFn: () => extensionApi.productAudit.getDefaultFailurePolicy(),
  });
  const saveMutation = useMutation({
    mutationFn: (policy: ProductAuditFailurePolicy) => extensionApi.productAudit.setFailurePolicy(policy),
    onSuccess: (_result, policy) => {
      queryClient.setQueryData(queryKeys.productAuditFailurePolicy.item, normalizeProductAuditFailurePolicy(policy));
    },
  });

  const fetchPolicy = useCallback(async () => queryClient.fetchQuery({
    queryKey: queryKeys.productAuditFailurePolicy.item,
    queryFn: () => extensionApi.productAudit.getFailurePolicy(),
  }), [queryClient]);

  const savePolicy = useCallback(async (policy: ProductAuditFailurePolicy): Promise<void> => {
    await saveMutation.mutateAsync(policy);
  }, [saveMutation.mutateAsync]);

  return {
    policy: policyQuery.data ? normalizeProductAuditFailurePolicy(policyQuery.data) : fallbackPolicy,
    defaultPolicy: defaultsQuery.data ? normalizeProductAuditFailurePolicy(defaultsQuery.data) : fallbackPolicy,
    loading: policyQuery.isLoading || defaultsQuery.isLoading,
    fetchPolicy,
    savePolicy,
  };
}
