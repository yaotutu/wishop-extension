import type { InfiniteData } from '@tanstack/react-query';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { extensionApi } from '../shared/extension-api';
import { isCredentialError } from '../shared/errors';
import type {
  OrderAssociation,
  OrderRealAddressCache,
  OrderSearchParams,
  OrderStatus,
  OrderTimeScope,
  ProductSourceBinding,
  ProductSourceItem,
  ShipOrderFromPurchaseInput,
} from '../shared/types';
import { useCredentialError } from '../contexts/CredentialErrorContext';
import { queryKeys } from '../query/query-keys';
import {
  createOrderListSnapshot,
  getOrderListCacheKey,
  normalizeOrderListData,
  ordersToInfiniteData,
  readCachedOrderList,
  writeCachedOrderList,
  type OrderListPage,
} from './order-list-cache';

function useReportQueryError() {
  const { reportCredentialError } = useCredentialError();
  return (error: unknown) => {
    if (isCredentialError(error)) reportCredentialError(error);
  };
}

export function useOrdersQuery(
  accountId: string,
  status?: OrderStatus,
  search?: OrderSearchParams | null,
  timeScope: OrderTimeScope = 'all',
) {
  const reportError = useReportQueryError();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => queryKeys.orders.list(accountId, status, search, timeScope),
    [accountId, search, status, timeScope],
  );
  const storageKey = useMemo(() => getOrderListCacheKey(queryKey), [queryKey]);
  const lastSignatureRef = useRef('');
  const [cacheHydrated, setCacheHydrated] = useState(false);
  const [hasCachedData, setHasCachedData] = useState(false);
  const query = useInfiniteQuery({
    queryKey,
    enabled: !!accountId,
    initialPageParam: true,
    queryFn: async ({ pageParam }) => {
      try {
        if (search?.keyword?.trim()) {
          return await extensionApi.orders.search(accountId, search);
        }
        return await extensionApi.orders.list(accountId, status, 50, pageParam, timeScope);
      } catch (error) {
        reportError(error);
        throw error;
      }
    },
    getNextPageParam: (lastPage) => {
      if (search?.keyword?.trim()) return undefined;
      return lastPage.hasMore ? false : undefined;
    },
  });

  useEffect(() => {
    let cancelled = false;
    lastSignatureRef.current = '';
    setCacheHydrated(false);
    setHasCachedData(false);
    if (!accountId) return;

    readCachedOrderList(storageKey)
      .then((cached) => {
        if (cancelled || !cached) return;
        lastSignatureRef.current = cached.signature;
        setHasCachedData(cached.orders.length > 0);
        queryClient.setQueryData<InfiniteData<OrderListPage, unknown>>(queryKey, current => (
          current ?? ordersToInfiniteData(cached)
        ));
        void queryClient.invalidateQueries({ queryKey, exact: true });
      })
      .finally(() => {
        if (!cancelled) setCacheHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, queryClient, queryKey, storageKey]);

  useEffect(() => {
    if (!query.data) return;
    const mergedData = normalizeOrderListData(query.data);
    const currentSnapshot = createOrderListSnapshot(query.data);
    const snapshot = createOrderListSnapshot(mergedData);

    if (snapshot.signature === lastSignatureRef.current) {
      if (snapshot.signature !== currentSnapshot.signature) {
        queryClient.setQueryData(queryKey, mergedData);
      }
      return;
    }

    lastSignatureRef.current = snapshot.signature;
    writeCachedOrderList(storageKey, snapshot);

    if (snapshot.signature !== currentSnapshot.signature) {
      queryClient.setQueryData(queryKey, mergedData);
    }
  }, [query.data, queryClient, queryKey, storageKey]);

  const orders = useMemo(
    () => query.data?.pages.flatMap(page => page.orders) ?? [],
    [query.data],
  );
  const hasMore = !search?.keyword?.trim() && (query.hasNextPage ?? false);

  return {
    ...query,
    orders,
    hasMore,
    loading: query.isFetching || (!hasCachedData && (!cacheHydrated || query.isLoading)),
  };
}

export function useOrderDetailQuery(accountId: string, orderId?: string) {
  const reportError = useReportQueryError();
  return useQuery({
    queryKey: queryKeys.orders.detail(accountId, orderId || ''),
    enabled: !!accountId && !!orderId,
    queryFn: async () => {
      try {
        return await extensionApi.orders.detail(accountId, orderId!);
      } catch (error) {
        reportError(error);
        throw error;
      }
    },
  });
}

export function useProductSourcesQuery(accountId: string) {
  return useQuery({
    queryKey: queryKeys.productSources.list(accountId),
    enabled: !!accountId,
    queryFn: () => extensionApi.productSources.list(accountId),
    select: bindingsToRecord,
  });
}

export function useOrderAssociationsQuery(accountId: string) {
  return useQuery({
    queryKey: queryKeys.orderAssociations.list(accountId),
    enabled: !!accountId,
    queryFn: () => extensionApi.orderAssociations.list(accountId),
    select: associationsToRecord,
  });
}

export function useRealAddressCachesQuery(accountId: string) {
  return useQuery({
    queryKey: queryKeys.realAddresses.list(accountId),
    enabled: !!accountId,
    queryFn: () => extensionApi.orderRealAddresses.list(accountId),
    select: realAddressCachesToRecord,
  });
}

export function useSaveProductSourcesMutation(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, sources }: { productId: string; sources: ProductSourceItem[] }) =>
      extensionApi.productSources.set(accountId, productId, sources),
    onSuccess: (binding) => {
      queryClient.setQueryData<ProductSourceBinding[]>(
        queryKeys.productSources.list(accountId),
        (current = []) => [
          ...current.filter(item => item.productId !== binding.productId),
          binding,
        ],
      );
    },
  });
}

export function useSaveOrderAssociationMutation(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, input }: {
      orderId: string;
      input: Pick<OrderAssociation, 'internalRemark' | 'linkedOrders'>;
    }) => extensionApi.orderAssociations.set(accountId, orderId, input),
    onSuccess: (association) => {
      queryClient.setQueryData<OrderAssociation[]>(
        queryKeys.orderAssociations.list(accountId),
        (current = []) => {
          const next = current.filter(item => item.orderId !== association.orderId);
          if (association.internalRemark || association.linkedOrders.length > 0) {
            next.push(association);
          }
          return next;
        },
      );
    },
  });
}

export function useShipOrderFromPurchaseMutation(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<ShipOrderFromPurchaseInput, 'accountId'>) =>
      extensionApi.orders.shipFromPurchase({ ...input, accountId }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['orders', accountId] });
      queryClient.setQueryData(queryKeys.orders.detail(accountId, result.order.order_id), result.order);
    },
  });
}

export function useFetchRealAddressMutation(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, refresh }: { orderId: string; refresh: boolean }) => (
      refresh
        ? extensionApi.orderRealAddresses.refresh(accountId, orderId)
        : extensionApi.orderRealAddresses.fetch(accountId, orderId)
    ),
    onSuccess: (cache) => {
      queryClient.setQueryData<OrderRealAddressCache[]>(
        queryKeys.realAddresses.list(accountId),
        (current = []) => [
          ...current.filter(item => item.orderId !== cache.orderId),
          cache,
        ],
      );
      queryClient.setQueryData(queryKeys.realAddresses.item(accountId, cache.orderId), cache);
    },
  });
}

function bindingsToRecord(bindings: ProductSourceBinding[]): Record<string, ProductSourceItem[]> {
  return Object.fromEntries(bindings.map(binding => [binding.productId, binding.sources]));
}

function associationsToRecord(associations: OrderAssociation[]): Record<string, OrderAssociation> {
  return Object.fromEntries(associations.map(item => [item.orderId, item]));
}

function realAddressCachesToRecord(caches: OrderRealAddressCache[]): Record<string, OrderRealAddressCache> {
  return Object.fromEntries(caches.map(item => [item.orderId, item]));
}
