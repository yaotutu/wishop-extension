import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extensionApi } from '../shared/extension-api';
import type { ProductAuditTaskConfig, ProductAuditTaskResult } from '../shared/types';
import { queryKeys } from '../query/query-keys';

const defaultProductAuditConfig: ProductAuditTaskConfig = {
  submitUnauditedDrafts: true,
  submitLimit: 0,
};

export function useProductAuditConfig(accountId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.productAuditConfig.item(accountId),
    enabled: !!accountId,
    queryFn: () => extensionApi.productAudit.getConfig(accountId),
  });

  const saveMutation = useMutation({
    mutationFn: (config: ProductAuditTaskConfig) => extensionApi.productAudit.setConfig(accountId, config),
    onSuccess: (_result, config) => {
      queryClient.setQueryData(queryKeys.productAuditConfig.item(accountId), config);
    },
  });

  const fetchProductAuditConfig = useCallback(async () => {
    if (!accountId) return defaultProductAuditConfig;
    return queryClient.fetchQuery({
      queryKey: queryKeys.productAuditConfig.item(accountId),
      queryFn: () => extensionApi.productAudit.getConfig(accountId),
    });
  }, [accountId, queryClient]);

  const saveProductAuditConfig = useCallback(async (config: ProductAuditTaskConfig) => {
    if (!accountId) return;
    await saveMutation.mutateAsync(config);
  }, [accountId, saveMutation]);

  const runProductAuditTask = useCallback(async (config: ProductAuditTaskConfig): Promise<ProductAuditTaskResult> => {
    return extensionApi.productAudit.run(accountId, config);
  }, [accountId]);

  return {
    productAuditConfig: query.data ?? defaultProductAuditConfig,
    loading: query.isLoading,
    fetchProductAuditConfig,
    saveProductAuditConfig,
    runProductAuditTask,
  };
}
