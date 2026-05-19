import type { OrderSearchParams, OrderStatus } from '../shared/types';

export const queryKeys = {
  orders: {
    list: (accountId: string, status?: OrderStatus, search?: OrderSearchParams | null) => [
      'orders',
      accountId,
      status ?? 'all',
      search?.search_type ?? '',
      search?.keyword ?? '',
    ] as const,
    detail: (accountId: string, orderId: string) => ['orders', accountId, 'detail', orderId] as const,
  },
  productSources: {
    list: (accountId: string) => ['productSources', accountId] as const,
  },
  orderAssociations: {
    list: (accountId: string) => ['orderAssociations', accountId] as const,
  },
  realAddresses: {
    list: (accountId: string) => ['orderRealAddresses', accountId] as const,
    item: (accountId: string, orderId: string) => ['orderRealAddresses', accountId, orderId] as const,
  },
};
