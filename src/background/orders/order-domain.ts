import { getAccounts } from '../store/account-repository';
import { createOrderDomainService } from './order-domain-service';
import { createOrderSyncService } from './order-sync-service';
import { orderStore } from './order-store';
import { createWxOrderSource } from './wx-order-source';

export const wxOrderSource = createWxOrderSource();

export const orderSyncService = createOrderSyncService({
  store: orderStore,
  source: wxOrderSource,
  getAccounts,
});

export const orderDomainService = createOrderDomainService({
  store: orderStore,
  sync: orderSyncService,
});
