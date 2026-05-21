import type { InfiniteData } from '@tanstack/react-query';
import type { Order } from '../shared/types';

export interface OrderListPage {
  orders: Order[];
  hasMore: boolean;
}

export interface CachedOrderList {
  orders: Order[];
  hasMore: boolean;
  signature: string;
  savedAt: number;
}

const CACHE_PREFIX = 'ordersListCache:';
const MAX_CACHED_ORDERS = 500;

export function getOrderListCacheKey(parts: readonly unknown[]): string {
  return `${CACHE_PREFIX}${parts.map(part => encodeURIComponent(String(part))).join(':')}`;
}

export async function readCachedOrderList(cacheKey: string): Promise<CachedOrderList | null> {
  const data = await chrome.storage.local.get(cacheKey);
  const cached = data[cacheKey] as CachedOrderList | undefined;
  if (!cached || !Array.isArray(cached.orders) || typeof cached.signature !== 'string') return null;
  return cached;
}

export function writeCachedOrderList(cacheKey: string, cached: CachedOrderList): void {
  void chrome.storage.local.set({ [cacheKey]: cached }).catch(() => {});
}

export function ordersToInfiniteData(cached: CachedOrderList): InfiniteData<OrderListPage, unknown> {
  return {
    pages: [{ orders: cached.orders, hasMore: cached.hasMore }],
    pageParams: [true],
  };
}

export function createOrderListSnapshot(data: InfiniteData<OrderListPage, unknown>): CachedOrderList {
  const orders = dedupeOrders(data.pages.flatMap(page => page.orders)).slice(0, MAX_CACHED_ORDERS);
  return {
    orders,
    hasMore: data.pages.some(page => page.hasMore),
    signature: createOrderListSignature(orders),
    savedAt: Date.now(),
  };
}

export function mergeOrderListData(
  currentData: InfiniteData<OrderListPage, unknown>,
  cachedOrders: Order[],
): InfiniteData<OrderListPage, unknown> {
  const freshOrders = currentData.pages.flatMap(page => page.orders);
  const mergedOrders = dedupeOrders([...freshOrders, ...cachedOrders]).slice(0, MAX_CACHED_ORDERS);
  return {
    pages: [{ orders: mergedOrders, hasMore: currentData.pages.some(page => page.hasMore) }],
    pageParams: [true],
  };
}

function dedupeOrders(orders: Order[]): Order[] {
  const seen = new Set<string>();
  const result: Order[] = [];
  for (const order of orders) {
    if (seen.has(order.order_id)) continue;
    seen.add(order.order_id);
    result.push(order);
  }
  return result;
}

function createOrderListSignature(orders: Order[]): string {
  return orders
    .map(order => [
      order.order_id,
      order.status,
      order.update_time,
      order.order_detail?.delivery_info?.delivery_product_info?.map(info => `${info.delivery_id || ''}:${info.waybill_id || ''}`).join(',') || '',
    ].join('|'))
    .join('::');
}
