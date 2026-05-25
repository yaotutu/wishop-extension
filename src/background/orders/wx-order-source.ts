import type { Order, OrderListParams, OrderListResult, OrderSearchParams, OrderStatus } from '../../shared/types';
import { getRecentOrderWindow, makeRecentOrderWindowState, moveRecentOrderWindowBack } from './recent-order-window.ts';

const MAX_EMPTY_RECENT_WINDOWS = 26;
const MAX_STATUS_FALLBACK_WINDOWS = 5;
const MAX_PAGES_PER_WINDOW = 10;
const RECENT_SYNC_FALLBACK_STATUSES = [
  20,
  21,
  30,
  10,
  12,
  13,
  100,
  200,
  250,
] as OrderStatus[];

async function fetchOrderDetails(
  orderIds: string[],
  getOrderDetail: (orderId: string) => Promise<Order>,
): Promise<Order[]> {
  if (orderIds.length === 0) return [];
  const settled = await Promise.allSettled(orderIds.map(orderId => getOrderDetail(orderId)));
  const orders = settled
    .map(result => result.status === 'fulfilled' ? result.value : null)
    .filter((order): order is Order => order !== null);
  if (orderIds.length > 0 && orders.length === 0) {
    throw new Error(`订单列表已返回 ${orderIds.length} 个订单号，但订单详情全部获取失败，请稍后重试`);
  }
  return orders;
}

function dedupeOrders(orders: Order[]): Order[] {
  const byId = new Map<string, Order>();
  for (const order of orders) {
    if (order.order_id) byId.set(order.order_id, order);
  }
  return [...byId.values()];
}

export interface WxOrderSource {
  fetchRecentOrders(accountId: string, options?: FetchRecentOrdersOptions): Promise<Order[]>;
  searchOrders(accountId: string, params: OrderSearchParams): Promise<Order[]>;
  getOrderDetail(accountId: string, orderId: string): Promise<Order>;
}

export interface FetchRecentOrdersOptions {
  fallbackStatuses?: boolean;
}

export interface WxOrderClient {
  getOrderList(params: OrderListParams): Promise<OrderListResult>;
  getOrderDetail(orderId: string): Promise<Order>;
  searchOrders(params: OrderSearchParams): Promise<OrderListResult>;
}

export type ResolveWxOrderClient = (accountId: string) => Promise<WxOrderClient>;

async function defaultResolveWxOrderClient(accountId: string): Promise<WxOrderClient> {
  const { getClient } = await import('../wxshop/client-registry');
  return getClient(accountId);
}

async function fetchWindowOrders(
  api: WxOrderClient,
  timeRange: NonNullable<OrderListParams['create_time_range']>,
  status?: OrderStatus,
): Promise<Order[]> {
  const orders: Order[] = [];
  let nextKey = '';
  let scannedPages = 0;

  while (scannedPages < MAX_PAGES_PER_WINDOW) {
    scannedPages += 1;
    const params: OrderListParams = {
      page_size: 50,
      create_time_range: timeRange,
    };
    if (nextKey) params.next_key = nextKey;
    if (status !== undefined) params.status = status;

    const listResult = await api.getOrderList(params);
    orders.push(...await fetchOrderDetails(listResult.order_id_list, api.getOrderDetail));
    if (!listResult.has_more || !listResult.next_key || listResult.next_key === nextKey) break;
    nextKey = listResult.next_key;
  }

  return dedupeOrders(orders);
}

async function fetchStatusWindowOrders(
  api: WxOrderClient,
  timeRange: NonNullable<OrderListParams['create_time_range']>,
): Promise<Order[]> {
  const orders: Order[] = [];
  for (const status of RECENT_SYNC_FALLBACK_STATUSES) {
    orders.push(...await fetchWindowOrders(api, timeRange, status));
  }
  return dedupeOrders(orders);
}

export function createWxOrderSource(resolveClient: ResolveWxOrderClient = defaultResolveWxOrderClient): WxOrderSource {
  return {
    async fetchRecentOrders(accountId: string, options: FetchRecentOrdersOptions = {}): Promise<Order[]> {
      const api = await resolveClient(accountId);
      const state = makeRecentOrderWindowState();
      let scannedEmptyWindows = 0;

      while (scannedEmptyWindows < MAX_EMPTY_RECENT_WINDOWS) {
        const timeRange = getRecentOrderWindow(state);
        if (!timeRange) return [];
        const orders = await fetchWindowOrders(api, timeRange);
        if (orders.length > 0) return orders;
        if (options.fallbackStatuses && scannedEmptyWindows < MAX_STATUS_FALLBACK_WINDOWS) {
          const statusOrders = await fetchStatusWindowOrders(api, timeRange);
          if (statusOrders.length > 0) return statusOrders;
        }
        scannedEmptyWindows += 1;
        moveRecentOrderWindowBack(state);
      }

      return [];
    },

    async searchOrders(accountId: string, params: OrderSearchParams): Promise<Order[]> {
      const api = await resolveClient(accountId);
      const listResult = await api.searchOrders(params);
      return fetchOrderDetails(listResult.order_id_list, api.getOrderDetail);
    },

    async getOrderDetail(accountId: string, orderId: string): Promise<Order> {
      return (await resolveClient(accountId)).getOrderDetail(orderId);
    },
  };
}
