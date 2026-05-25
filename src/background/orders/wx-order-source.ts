import type { Order, OrderListParams, OrderListResult, OrderSearchParams, OrderStatus } from '../../shared/types';
import { normalizeOrderListTimeRange } from '../../shared/order-time-range.ts';
import { createLogger } from '../utils/logger.ts';
import { getRecentOrderWindow, makeRecentOrderWindowState, moveRecentOrderWindowBack } from './recent-order-window.ts';

const MAX_RECENT_WINDOWS = 26;
const MAX_STATUS_FALLBACK_WINDOWS = 5;
const MAX_PAGES_PER_WINDOW = 10;
const MAX_RECENT_SYNC_ORDERS = 500;
const RECENT_SYNC_FALLBACK_STATUSES = [
  20,
  21,
  30,
  10,
  12,
  13,
  100,
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
  debug?: boolean;
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

function assertValidTimeRange(
  timeRange: NonNullable<OrderListParams['create_time_range']>,
  accountId: string,
  status: OrderStatus | undefined,
): void {
  if (normalizeOrderListTimeRange(timeRange)) return;
  throw new Error(`订单同步内部错误：订单列表请求缺少有效时间范围 accountId=${accountId}, status=${status ?? 'all'}, range=${JSON.stringify(timeRange)}`);
}

async function fetchWindowOrders(
  api: WxOrderClient,
  accountId: string,
  timeRange: NonNullable<OrderListParams['create_time_range']>,
  status?: OrderStatus,
  debug = false,
  windowIndex = 0,
): Promise<Order[]> {
  assertValidTimeRange(timeRange, accountId, status);
  const logger = debug ? createLogger('OrderSource', accountId) : null;
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

    logger?.info('订单列表请求', {
      windowIndex,
      page: scannedPages,
      status: status ?? 'all',
      create_time_range: timeRange,
      hasNextKey: Boolean(nextKey),
    });
    let listResult: OrderListResult;
    try {
      listResult = await api.getOrderList(params);
    } catch (error) {
      logger?.error('订单列表请求失败', {
        windowIndex,
        page: scannedPages,
        status: status ?? 'all',
        create_time_range: timeRange,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    logger?.info('订单列表响应', {
      windowIndex,
      page: scannedPages,
      status: status ?? 'all',
      orderIdCount: listResult.order_id_list.length,
      hasMore: listResult.has_more,
      hasNextKey: Boolean(listResult.next_key),
    });
    orders.push(...await fetchOrderDetails(listResult.order_id_list, api.getOrderDetail));
    if (!listResult.has_more || !listResult.next_key || listResult.next_key === nextKey) break;
    nextKey = listResult.next_key;
  }

  return dedupeOrders(orders);
}

async function fetchStatusWindowOrders(
  api: WxOrderClient,
  accountId: string,
  timeRange: NonNullable<OrderListParams['create_time_range']>,
  debug = false,
  windowIndex = 0,
): Promise<Order[]> {
  const orders: Order[] = [];
  for (const status of RECENT_SYNC_FALLBACK_STATUSES) {
    orders.push(...await fetchWindowOrders(api, accountId, timeRange, status, debug, windowIndex));
  }
  return dedupeOrders(orders);
}

export function createWxOrderSource(resolveClient: ResolveWxOrderClient = defaultResolveWxOrderClient): WxOrderSource {
  return {
    async fetchRecentOrders(accountId: string, options: FetchRecentOrdersOptions = {}): Promise<Order[]> {
      const api = await resolveClient(accountId);
      const state = makeRecentOrderWindowState();
      let scannedWindows = 0;
      let orders: Order[] = [];
      const logger = options.debug ? createLogger('OrderSource', accountId) : null;
      logger?.info('最近订单同步开始', { fallbackStatuses: Boolean(options.fallbackStatuses) });

      while (scannedWindows < MAX_RECENT_WINDOWS && orders.length < MAX_RECENT_SYNC_ORDERS) {
        const timeRange = getRecentOrderWindow(state);
        if (!timeRange) break;
        const windowIndex = scannedWindows + 1;
        const windowOrders = await fetchWindowOrders(api, accountId, timeRange, undefined, options.debug, windowIndex);
        orders = dedupeOrders([...orders, ...windowOrders]).slice(0, MAX_RECENT_SYNC_ORDERS);
        if (options.fallbackStatuses && windowOrders.length === 0 && scannedWindows < MAX_STATUS_FALLBACK_WINDOWS) {
          logger?.info('无状态列表为空，开始按状态回退查询', {
            windowIndex,
            create_time_range: timeRange,
          });
          const statusOrders = await fetchStatusWindowOrders(api, accountId, timeRange, options.debug, windowIndex);
          orders = dedupeOrders([...orders, ...statusOrders]).slice(0, MAX_RECENT_SYNC_ORDERS);
        }
        scannedWindows += 1;
        moveRecentOrderWindowBack(state);
      }

      logger?.info('最近订单同步完成', {
        scannedWindowCount: scannedWindows,
        orderCount: orders.length,
        capped: orders.length >= MAX_RECENT_SYNC_ORDERS,
      });
      return orders;
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
