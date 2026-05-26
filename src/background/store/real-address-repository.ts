import type { OrderAddressInfo, OrderRealAddressCache } from '../../shared/types';
import { ensureAccountWorkspace, updateAccountWorkspace } from './workspace-repository.ts';

export async function getRealAddressCaches(accountId: string): Promise<OrderRealAddressCache[]> {
  return (await ensureAccountWorkspace(accountId)).realAddressCaches;
}

export async function getRealAddressCache(accountId: string, orderId: string): Promise<OrderRealAddressCache | null> {
  return (await getRealAddressCaches(accountId)).find(item => item.orderId === orderId) || null;
}

export async function setRealAddressCache(
  accountId: string,
  orderId: string,
  address: OrderAddressInfo,
): Promise<OrderRealAddressCache> {
  const now = Date.now();
  const cache: OrderRealAddressCache = {
    orderId,
    address,
    fetchedAt: now,
    updatedAt: now,
  };
  await updateAccountWorkspace(accountId, workspace => {
    const caches = workspace.realAddressCaches || [];
    workspace.realAddressCaches = [...caches.filter(item => item.orderId !== orderId), cache];
  });
  return cache;
}
