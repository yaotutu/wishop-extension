import type { OrderRealAddressCache } from '../../shared/types';
import { getClient } from '../wxshop/client-registry';
import { getRealAddressCache, getRealAddressCaches, setRealAddressCache } from '../store/real-address-repository';

export async function listRealAddressCaches(accountId: string): Promise<OrderRealAddressCache[]> {
  return getRealAddressCaches(accountId);
}

export async function getCachedRealAddress(accountId: string, orderId: string): Promise<OrderRealAddressCache | null> {
  return getRealAddressCache(accountId, orderId);
}

export async function fetchAndCacheRealAddress(accountId: string, orderId: string): Promise<OrderRealAddressCache> {
  const address = await (await getClient(accountId)).decodeOrderSensitiveInfo(orderId);
  return setRealAddressCache(accountId, orderId, address);
}
