import type { ActivityLogDomain } from '../../shared/activity-log.ts';
import { createWxShopListingClient } from './listing/api';
import type { WxShopListingClient } from './listing/types';
import { createWxShopOrdersClient } from './orders/api';
import type { WxShopOrdersClient } from './orders/types';

const listingClients = new Map<string, WxShopListingClient>();
const ordersClients = new Map<string, WxShopOrdersClient>();

function listingClientKey(accountId: string, domain: ActivityLogDomain): string {
  return `${domain}:${accountId}`;
}

/**
 * 商品发布域客户端。
 *
 * 只包含草稿、提审、删除和配额能力；后续复制商品 API 也归入这个功能域。
 */
export async function getListingClient(
  accountId: string,
  domain: ActivityLogDomain = 'productAudit',
): Promise<WxShopListingClient> {
  const key = listingClientKey(accountId, domain);
  let client = listingClients.get(key);
  if (!client) {
    client = createWxShopListingClient(accountId, domain);
    listingClients.set(key, client);
  }
  return client;
}

/**
 * 订单域客户端。
 *
 * 只包含订单、售后、地址解密、快递公司和发货能力。
 */
export async function getOrdersClient(accountId: string): Promise<WxShopOrdersClient> {
  let client = ordersClients.get(accountId);
  if (!client) {
    client = createWxShopOrdersClient(accountId);
    ordersClients.set(accountId, client);
  }
  return client;
}

export function removeWxShopClients(accountId: string): void {
  for (const key of listingClients.keys()) {
    if (key.endsWith(`:${accountId}`)) listingClients.delete(key);
  }
  ordersClients.delete(accountId);
}
