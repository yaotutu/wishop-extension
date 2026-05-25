import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { extensionApi } from '../shared/extension-api';
import { isCredentialError } from '../shared/errors';
import type {
  OrderAssociation,
  OrderScope,
  OrderSearchSource,
  OrderRealAddressCache,
  OrderSearchParams,
  OrderStatus,
  OrderTimeScope,
  ProductSourceBinding,
  ProductSourceItem,
  ShipOrderFromPurchaseInput,
  StoredOrderSnapshot,
} from '../shared/types';
import { useCredentialError } from '../contexts/CredentialErrorContext';
import { queryKeys } from '../query/query-keys';

function useReportQueryError() {
  const { reportCredentialError } = useCredentialError();
  return (error: unknown) => {
    if (isCredentialError(error)) reportCredentialError(error);
  };
}

export function useOrdersQuery(
  scope: OrderScope,
  status?: OrderStatus,
  search?: OrderSearchParams | null,
  timeScope: OrderTimeScope = 'all',
  searchSource: OrderSearchSource = 'local',
) {
  const reportError = useReportQueryError();
  const queryKey = useMemo(
    () => search?.keyword?.trim()
      ? queryKeys.orders.search(scope, search, searchSource)
      : queryKeys.orders.list(scope, status, search, timeScope),
    [scope, search, searchSource, status, timeScope],
  );
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      try {
        if (search?.keyword?.trim()) {
          return await extensionApi.orders.search(scope, { ...search, page_size: 50, next_key: pageParam }, searchSource);
        }
        return await extensionApi.orders.list(scope, {
          status,
          timeScope,
          pageSize: 50,
          cursor: pageParam,
        });
      } catch (error) {
        reportError(error);
        throw error;
      }
    },
    getNextPageParam: lastPage => lastPage.nextCursor,
  });

  const orders = useMemo(
    () => query.data?.pages.flatMap(page => page.orders) ?? [],
    [query.data],
  );
  const hasMore = query.hasNextPage ?? false;

  return {
    ...query,
    orders,
    hasMore,
    loading: query.isFetching || query.isLoading,
  };
}

export function useOrderSyncStateQuery(scope: OrderScope) {
  return useQuery({
    queryKey: queryKeys.orders.syncState(scope),
    queryFn: () => extensionApi.orders.syncState(scope),
    refetchInterval: 1000,
  });
}

export function useRefreshOrdersMutation(scope: OrderScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => extensionApi.orders.refresh(scope),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
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

export function useProductSourcesQuery(accountIds: string[]) {
  return useQuery({
    queryKey: ['productSources', ...accountIds],
    enabled: accountIds.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(accountIds.map(async accountId => ({
        accountId,
        bindings: await extensionApi.productSources.list(accountId),
      })));
      return entries.flatMap(entry => entry.bindings.map(binding => ({ ...binding, accountId: entry.accountId })));
    },
    select: bindingsToRecord,
  });
}

export function useOrderAssociationsQuery(accountIds: string[]) {
  return useQuery({
    queryKey: ['orderAssociations', ...accountIds],
    enabled: accountIds.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(accountIds.map(async accountId => ({
        accountId,
        associations: await extensionApi.orderAssociations.list(accountId),
      })));
      return entries.flatMap(entry => entry.associations.map(association => ({ ...association, accountId: entry.accountId })));
    },
    select: associationsToRecord,
  });
}

export function useRealAddressCachesQuery(accountIds: string[]) {
  return useQuery({
    queryKey: ['orderRealAddresses', ...accountIds],
    enabled: accountIds.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(accountIds.map(async accountId => ({
        accountId,
        caches: await extensionApi.orderRealAddresses.list(accountId),
      })));
      return entries.flatMap(entry => entry.caches.map(cache => ({ ...cache, accountId: entry.accountId })));
    },
    select: realAddressCachesToRecord,
  });
}

export function useSaveProductSourcesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, productId, sources }: { accountId: string; productId: string; sources: ProductSourceItem[] }) =>
      extensionApi.productSources.set(accountId, productId, sources),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['productSources'] });
    },
  });
}

export function useSaveOrderAssociationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, orderId, input }: {
      accountId: string;
      orderId: string;
      input: Pick<OrderAssociation, 'internalRemark' | 'linkedOrders'>;
    }) => extensionApi.orderAssociations.set(accountId, orderId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orderAssociations'] });
    },
  });
}

export function useShipOrderFromPurchaseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ShipOrderFromPurchaseInput) =>
      extensionApi.orders.shipFromPurchase(input),
    onSuccess: (result, input) => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.setQueryData(queryKeys.orders.detail(input.accountId, result.order.order_id), result.order);
    },
  });
}

export function useFetchRealAddressMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, orderId, refresh }: { accountId: string; orderId: string; refresh: boolean }) => (
      refresh
        ? extensionApi.orderRealAddresses.refresh(accountId, orderId)
        : extensionApi.orderRealAddresses.fetch(accountId, orderId)
    ),
    onSuccess: (cache, input) => {
      void queryClient.invalidateQueries({ queryKey: ['orderRealAddresses'] });
      queryClient.setQueryData(queryKeys.realAddresses.item(input.accountId, cache.orderId), cache);
    },
  });
}

function scopedKey(accountId: string, id: string): string {
  return `${accountId}:${id}`;
}

function bindingsToRecord(bindings: Array<ProductSourceBinding & { accountId: string }>): Record<string, ProductSourceItem[]> {
  return Object.fromEntries(bindings.map(binding => [scopedKey(binding.accountId, binding.productId), binding.sources]));
}

function associationsToRecord(associations: Array<OrderAssociation & { accountId: string }>): Record<string, OrderAssociation> {
  return Object.fromEntries(associations.map(item => [scopedKey(item.accountId, item.orderId), item]));
}

function realAddressCachesToRecord(caches: Array<OrderRealAddressCache & { accountId: string }>): Record<string, OrderRealAddressCache> {
  return Object.fromEntries(caches.map(item => [scopedKey(item.accountId, item.orderId), item]));
}
