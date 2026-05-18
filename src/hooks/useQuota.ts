import { useCallback } from 'react';
import { extensionApi } from '../shared/extension-api';
import type { QuotaResult } from '../shared/types';
import { useIpcFetch } from './useIpcFetch';
import { isCredentialError } from '../shared/errors';
import { useCredentialError } from '../contexts/CredentialErrorContext';

export function useQuota(accountId: string) {
  const { reportCredentialError } = useCredentialError();

  const { data: quota, loading, fetch: fetchQuota } = useIpcFetch<QuotaResult>(
    accountId,
    useCallback(async () => {
      try {
        return await extensionApi.quota.get(accountId);
      } catch (error: unknown) {
        if (isCredentialError(error)) reportCredentialError(error);
        return { quota: 0, total: 0 };
      }
    }, [accountId, reportCredentialError]),
    { quota: 0, total: 0 },
    { autoFetch: false },
  );

  return { quota, loading, fetchQuota };
}
