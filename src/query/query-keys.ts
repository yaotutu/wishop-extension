import type { OrderScope, OrderSearchParams, OrderSearchSource, OrderStatus, OrderTimeScope } from '../shared/types';

function orderScopeKey(scope: OrderScope): readonly [string, string] {
  return scope.type === 'account'
    ? ['account', scope.accountId]
    : ['all', ''];
}

export const queryKeys = {
  accounts: {
    list: ['accounts'] as const,
    active: ['accounts', 'active'] as const,
  },
  config: {
    item: (accountId: string) => ['config', accountId] as const,
  },
  drafts: {
    list: (accountId: string) => ['drafts', accountId] as const,
  },
  orders: {
    list: (scope: OrderScope, status?: OrderStatus, search?: OrderSearchParams | null, timeScope?: OrderTimeScope) => [
      'orders',
      'list',
      ...orderScopeKey(scope),
      status ?? 'all',
      timeScope ?? 'all',
      search?.search_type ?? '',
      search?.keyword ?? '',
    ] as const,
    search: (scope: OrderScope, search: OrderSearchParams, source: OrderSearchSource) => [
      'orders',
      'search',
      ...orderScopeKey(scope),
      source,
      search.search_type,
      search.keyword,
    ] as const,
    detail: (accountId: string, orderId: string) => ['orders', accountId, 'detail', orderId] as const,
    syncState: (scope: OrderScope) => ['orders', 'syncState', ...orderScopeKey(scope)] as const,
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
  quota: {
    item: (accountId: string) => ['quota', accountId] as const,
  },
  listingLogs: {
    list: (accountId: string) => ['listingLogs', accountId] as const,
  },
  activityLogs: {
    list: ['activityLogs'] as const,
  },
  notifications: {
    list: ['notifications'] as const,
    preference: ['notifications', 'preference'] as const,
  },
  scheduledJobs: {
    list: ['scheduledJobs'] as const,
    orderSyncRecent: ['scheduledJobs', 'orders', 'syncRecent'] as const,
    accountListing: (accountId: string) => ['scheduledJobs', 'listing', 'account', accountId] as const,
    globalListing: ['scheduledJobs', 'listing', 'global'] as const,
  },
  taskConfig: {
    item: (accountId: string) => ['taskConfig', accountId] as const,
  },
  rules: {
    blacklist: ['rules', 'blacklist'] as const,
    blacklistDefaultCodes: ['rules', 'blacklist', 'defaultCodes'] as const,
    skipKeywords: ['rules', 'skipKeywords'] as const,
    status: ['rules', 'status'] as const,
  },
};
