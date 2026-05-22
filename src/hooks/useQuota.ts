import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { extensionApi } from '../shared/extension-api';
import type { QuotaResult } from '../shared/types';
import { isCredentialError } from '../shared/errors';
import { useCredentialError } from '../contexts/CredentialErrorContext';
import { queryKeys } from '../query/query-keys';

export function useQuota(accountId: string) {
  const { reportCredentialError } = useCredentialError();
  const queryClient = useQueryClient();

  const fetchQuotaValue = useCallback(async (force = false): Promise<QuotaResult> => {
    try {
      return await extensionApi.quota.get(accountId, force);
    } catch (error: unknown) {
      if (isCredentialError(error)) reportCredentialError(error);
      throw error;
    }
  }, [accountId, reportCredentialError]);

  const query = useQuery({
    queryKey: queryKeys.quota.item(accountId),
    enabled: false,
    queryFn: () => fetchQuotaValue(false),
    initialData: { quota: 0, total: 0 },
  });

  const fetchQuota = useCallback(async (force = false) => {
    if (!accountId) return { quota: 0, total: 0 };
    if (force) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.quota.item(accountId) });
    }
    return queryClient.fetchQuery({
      queryKey: queryKeys.quota.item(accountId),
      queryFn: () => fetchQuotaValue(force),
      staleTime: force ? 0 : undefined,
    });
  }, [accountId, fetchQuotaValue, queryClient]);

  return {
    quota: query.data,
    loading: query.isLoading || query.isFetching,
    error: query.error,
    fetchQuota,
  };
}
