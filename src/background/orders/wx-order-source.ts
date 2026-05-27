import type { Order, OrderListParams, OrderListResult, OrderSearchParams, OrderStatus, WxAfterSaleOrder } from '../../shared/types';
import { normalizeOrderListTimeRange } from '../../shared/order-time-range.ts';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';
import { enrichOrderAftersale } from './aftersale-enrichment.ts';
import { getRecentOrderWindow, makeRecentOrderWindowState, moveRecentOrderWindowBack } from './recent-order-window.ts';

const MAX_RECENT_WINDOWS = 26;
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
  250,
] as OrderStatus[];

async function fetchOrderDetails(
  orderIds: string[],
  api: WxOrderClient,
  accountId: string,
): Promise<Order[]> {
  if (orderIds.length === 0) return [];
  const logger = createDiagnosticLogger({ domain: 'orders', component: 'OrderAftersale', accountId });
  const settled = await Promise.allSettled(orderIds.map(async orderId => (
    enrichOrderAftersale(await api.getOrderDetail(orderId), {
      getAfterSaleOrder: afterSaleOrderId => api.getAfterSaleOrder
        ? api.getAfterSaleOrder(afterSaleOrderId)
        : Promise.reject(new Error('当前微信客户端未实现售后详情接口')),
      logger,
    })
  )));
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
  mode?: 'incremental' | 'full' | 'backfill';
  fallbackStatuses?: boolean;
  debug?: boolean;
  windowStartTime?: number;
  windowEndTime?: number;
  lookbackDays?: number;
  maxWindows?: number;
}

export interface WxOrderClient {
  getOrderList(params: OrderListParams): Promise<OrderListResult>;
  getOrderDetail(orderId: string): Promise<Order>;
  getAfterSaleOrder?(afterSaleOrderId: string): Promise<WxAfterSaleOrder>;
  searchOrders(params: OrderSearchParams): Promise<OrderListResult>;
}

export type ResolveWxOrderClient = (accountId: string) => Promise<WxOrderClient>;

function recentScanConfig(options: FetchRecentOrdersOptions): {
  mode: NonNullable<FetchRecentOrdersOptions['mode']>;
  nowSeconds: number;
  lookbackDays: number;
  maxWindows: number;
  explicitWindow?: { start_time: number; end_time: number };
} {
  const mode = options.mode || 'incremental';
  const defaultLookbackDays = mode === 'incremental' ? 7 : 182;
  const defaultMaxWindows = mode === 'full' ? MAX_RECENT_WINDOWS : 1;
  const explicitWindow = options.windowStartTime !== undefined && options.windowEndTime !== undefined
    ? {
      start_time: options.windowStartTime,
      end_time: options.windowEndTime,
    }
    : undefined;
  return {
    mode,
    nowSeconds: options.windowEndTime || Math.floor(Date.now() / 1000),
    lookbackDays: options.lookbackDays || defaultLookbackDays,
    maxWindows: explicitWindow ? 1 : options.maxWindows || defaultMaxWindows,
    explicitWindow,
  };
}

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
  const logger = debug ? createDiagnosticLogger({ domain: 'orders', component: 'OrderSource', accountId }) : null;
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
    orders.push(...await fetchOrderDetails(listResult.order_id_list, api, accountId));
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
      const scan = recentScanConfig(options);
      const state = makeRecentOrderWindowState(scan.nowSeconds, scan.lookbackDays);
      let scannedWindows = 0;
      let orders: Order[] = [];
      const logger = options.debug ? createDiagnosticLogger({ domain: 'orders', component: 'OrderSource', accountId }) : null;
      logger?.info('最近订单同步开始', {
        mode: scan.mode,
        fallbackStatuses: Boolean(options.fallbackStatuses),
        maxWindows: scan.maxWindows,
        lookbackDays: scan.lookbackDays,
      });

      while (scannedWindows < scan.maxWindows) {
        const timeRange = scan.explicitWindow && scannedWindows === 0
          ? scan.explicitWindow
          : getRecentOrderWindow(state);
        if (!timeRange) break;
        const windowIndex = scannedWindows + 1;
        const windowOrders = await fetchWindowOrders(api, accountId, timeRange, undefined, options.debug, windowIndex);
        orders = dedupeOrders([...orders, ...windowOrders]);
        if (options.fallbackStatuses && windowOrders.length === 0 && scannedWindows < MAX_STATUS_FALLBACK_WINDOWS) {
          logger?.info('无状态列表为空，开始按状态回退查询', {
            windowIndex,
            create_time_range: timeRange,
          });
          const statusOrders = await fetchStatusWindowOrders(api, accountId, timeRange, options.debug, windowIndex);
          orders = dedupeOrders([...orders, ...statusOrders]);
        }
        scannedWindows += 1;
        if (scan.explicitWindow) break;
        moveRecentOrderWindowBack(state);
      }

      logger?.info('最近订单同步完成', {
        mode: scan.mode,
        scannedWindowCount: scannedWindows,
        orderCount: orders.length,
      });
      return orders;
    },

    async searchOrders(accountId: string, params: OrderSearchParams): Promise<Order[]> {
      const api = await resolveClient(accountId);
      const listResult = await api.searchOrders(params);
      return fetchOrderDetails(listResult.order_id_list, api, accountId);
    },

    async getOrderDetail(accountId: string, orderId: string): Promise<Order> {
      const api = await resolveClient(accountId);
      return enrichOrderAftersale(await api.getOrderDetail(orderId), {
        getAfterSaleOrder: afterSaleOrderId => api.getAfterSaleOrder
          ? api.getAfterSaleOrder(afterSaleOrderId)
          : Promise.reject(new Error('当前微信客户端未实现售后详情接口')),
        logger: createDiagnosticLogger({ domain: 'orders', component: 'OrderAftersale', accountId }),
      });
    },
  };
}
