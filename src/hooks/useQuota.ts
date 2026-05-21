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

  const fetchQuotaValue = useCallback(async (): Promise<QuotaResult> => {
    try {
      return await extensionApi.quota.get(accountId);
    } catch (error: unknown) {
      if (isCredentialError(error)) reportCredentialError(error);
      return { quota: 0, total: 0 };
    }
  }, [accountId, reportCredentialError]);

  const query = useQuery({
    queryKey: queryKeys.quota.item(accountId),
    enabled: false,
    queryFn: fetchQuotaValue,
    initialData: { quota: 0, total: 0 },
  });

  const fetchQuota = useCallback(async () => {
    if (!accountId) return { quota: 0, total: 0 };
    return queryClient.fetchQuery({
      queryKey: queryKeys.quota.item(accountId),
      queryFn: fetchQuotaValue,
    });
  }, [accountId, fetchQuotaValue, queryClient]);

  return { quota: query.data, loading: query.isLoading || query.isFetching, fetchQuota };
}
