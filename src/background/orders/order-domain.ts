import { getAccounts } from '../store/account-repository';
import { createOrderDomainService } from './order-domain-service';
import { createOrderSyncService } from './order-sync-service.ts';
import { orderStore } from './order-store';
import { createOrderSyncActivityLog } from './order-sync-activity-log';
import { createWxOrderSource } from './wx-order-source';

export const wxOrderSource = createWxOrderSource();

export const orderSyncService = createOrderSyncService({
  store: orderStore,
  source: wxOrderSource,
  getAccounts,
  activityLog: createOrderSyncActivityLog(),
});

export const orderDomainService = createOrderDomainService({
  store: orderStore,
  sync: orderSyncService,
});
