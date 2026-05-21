import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { extensionApi } from '../shared/extension-api';
import { queryKeys } from '../query/query-keys';

export function useDrafts(accountId: string) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.drafts.list(accountId),
    enabled: false,
    initialPageParam: true,
    queryFn: ({ pageParam }) => extensionApi.drafts.fetch(accountId, pageParam),
    getNextPageParam: (lastPage) => lastPage.hasMore ? false : undefined,
  });
  const listMutation = useMutation({
    mutationFn: (productId: string) => extensionApi.drafts.list(accountId, productId),
  });
  const drafts = useMemo(
    () => query.data?.pages.flatMap(page => page.products) ?? [],
    [query.data],
  );

  const fetchDrafts = useCallback(async (reset = true) => {
    if (!accountId) return;
    if (!reset) {
      await query.fetchNextPage();
    } else {
      await query.refetch();
    }
  }, [accountId, query]);

  const listProduct = useCallback(async (productId: string) => {
    return listMutation.mutateAsync(productId);
  }, [listMutation]);

  return { drafts, hasMore: query.hasNextPage, loading: query.isLoading || query.isFetchingNextPage, fetchDrafts, listProduct };
}
