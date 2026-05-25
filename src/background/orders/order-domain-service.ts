import type {
  OrderListFilters,
  OrderScope,
  OrderSearchParams,
  OrderSearchSource,
} from '../../shared/types';
import type { OrderStore } from './order-store.ts';
import type { OrderSyncService } from './order-sync-service.ts';

export interface OrderDomainServiceDeps {
  store: OrderStore;
  sync: OrderSyncService;
}

export function createOrderDomainService(deps: OrderDomainServiceDeps) {
  return {
    list(scope: OrderScope, filters: OrderListFilters = {}) {
      return deps.store.list(scope, filters);
    },

    search(scope: OrderScope, params: OrderSearchParams, source: OrderSearchSource) {
      return source === 'remote'
        ? deps.sync.searchRemote(scope, params)
        : deps.store.search(scope, params);
    },

    refresh(scope: OrderScope) {
      return deps.sync.refresh(scope, { reason: 'manualRefresh' });
    },

    async detail(accountId: string, orderId: string, options: { refresh?: boolean } = {}) {
      if (!options.refresh) {
        const cached = await deps.store.get(accountId, orderId);
        if (cached) return cached.order;
      }
      return deps.sync.refreshDetail(accountId, orderId);
    },

    syncState(scope: OrderScope) {
      return deps.store.getSyncState(scope);
    },
  };
}

export type OrderDomainService = ReturnType<typeof createOrderDomainService>;
