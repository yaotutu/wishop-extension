import { useState, useCallback, useEffect } from 'react';
import { isCredentialError } from '../shared/errors';
import { useCredentialError } from '../contexts/CredentialErrorContext';

interface UseIpcFetchResult<T> {
  data: T;
  loading: boolean;
  fetch: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T>>;
}

export function useIpcFetch<T>(
  accountId: string,
  fetcher: () => Promise<T>,
  defaultValue: T,
  options?: { autoFetch?: boolean },
): UseIpcFetchResult<T> {
  const [data, setData] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(false);
  const { reportCredentialError } = useCredentialError();

  const fetch = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      setData(await fetcher());
    } catch (error: unknown) {
      if (isCredentialError(error)) reportCredentialError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [accountId, fetcher, reportCredentialError]);

  useEffect(() => {
    if (options?.autoFetch !== false) {
      fetch().catch(() => {});
    }
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, fetch, setData };
}
