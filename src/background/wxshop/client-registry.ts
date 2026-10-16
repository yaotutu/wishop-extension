/**
 * 微信小店客户端注册表。
 *
 * 「复制商品」业务域只用到商品发布（草稿、提审、类目查询、参数模板等）这一组 API，
 * 所以这里只缓存 listing 客户端。订单/发货/退款相关客户端已随订单域一起删除。
 */
import type { ActivityLogDomain } from '../../shared/activity-log.ts';
import { createWxShopListingClient } from './listing/api';
import type { WxShopListingClient } from './listing/types';

const listingClients = new Map<string, WxShopListingClient>();

function listingClientKey(accountId: string, domain: ActivityLogDomain): string {
  return `${domain}:${accountId}`;
}

/**
 * 商品发布域客户端。复制商品生成的草稿也走这个客户端。
 */
export async function getListingClient(
  accountId: string,
  domain: ActivityLogDomain = 'productCopy',
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
 * 删除指定账号的所有 listing 客户端缓存。一般在 account 被删除/配置变更时调用。
 */
export function removeWxShopClients(accountId: string): void {
  for (const key of listingClients.keys()) {
    if (key.endsWith(`:${accountId}`)) listingClients.delete(key);
  }
}
