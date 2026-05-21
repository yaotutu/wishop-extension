import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
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
  accountId: string,
  status?: OrderStatus,
  search?: OrderSearchParams | null,
  timeScope: OrderTimeScope = 'all',
) {
  const reportError = useReportQueryError();
  const query = useInfiniteQuery({
    queryKey: queryKeys.orders.list(accountId, status, search, timeScope),
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

  const orders = useMemo(
    () => query.data?.pages.flatMap(page => page.orders) ?? [],
    [query.data],
  );
  const hasMore = !search?.keyword?.trim() && (query.hasNextPage ?? false);

  return {
    ...query,
    orders,
    hasMore,
    loading: query.isLoading || query.isFetchingNextPage,
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
