import type { OrderAddressInfo, OrderRealAddressCache } from '../../shared/types';
import { getAccount } from './account-repository';
import { updateAccountData } from './core';

export async function getRealAddressCaches(accountId: string): Promise<OrderRealAddressCache[]> {
  return (await getAccount(accountId))?.realAddressCaches || [];
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
  await updateAccountData(accountId, account => {
    const caches = account.realAddressCaches || [];
    account.realAddressCaches = [...caches.filter(item => item.orderId !== orderId), cache];
  });
  return cache;
}
