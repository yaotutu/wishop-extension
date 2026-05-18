import { useState, useCallback } from 'react';
import { extensionApi } from '../shared/extension-api';
import type { DraftProduct } from '../shared/types';
import { useIpcFetch } from './useIpcFetch';

export function useDrafts(accountId: string) {
  const [hasMore, setHasMore] = useState(true);
  const { data: drafts, loading, fetch, setData: setDrafts } = useIpcFetch<DraftProduct[]>(
    accountId,
    useCallback(async () => {
      const { products, hasMore: more } = await extensionApi.drafts.fetch(accountId, true);
      setHasMore(more);
      return products;
    }, [accountId]),
    [],
    { autoFetch: false },
  );

  const fetchDrafts = useCallback(async (reset = true) => {
    if (!accountId) return;
    if (!reset) {
      const { products, hasMore: more } = await extensionApi.drafts.fetch(accountId, false);
      setDrafts(prev => [...prev, ...products]);
      setHasMore(more);
    } else {
      fetch();
    }
  }, [accountId, fetch, setDrafts]);

  const listProduct = useCallback(async (productId: string) => {
    return extensionApi.drafts.list(accountId, productId);
  }, [accountId]);

  return { drafts, hasMore, loading, fetchDrafts, listProduct };
}
