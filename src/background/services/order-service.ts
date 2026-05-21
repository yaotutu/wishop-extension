import type { Order, OrderListParams, OrderSearchParams, OrderStatus, OrderTimeScope } from '../../shared/types';
import { getClient } from '../wxshop/client-registry';
import { createLogger } from '../utils/logger';

interface OrderPaginationState {
  nextKey: string;
  hasMore: boolean;
  windowEndTime: number;
  minStartTime: number;
}

const orderPaginationMap = new Map<string, OrderPaginationState>();
const ORDER_TIME_WINDOW_SECONDS = 7 * 24 * 3600;
const MAX_EMPTY_WINDOWS_PER_REQUEST = 26;
const ALL_ORDERS_MIN_START_TIME = Math.floor(Date.UTC(2020, 0, 1) / 1000);

function makePaginationState(scope: OrderTimeScope): OrderPaginationState {
  const now = Math.floor(Date.now() / 1000);
  const minStartTime = scope === 'all'
    ? ALL_ORDERS_MIN_START_TIME
    : now - Number(scope.replace('d', '')) * 24 * 3600;
  return {
    nextKey: '',
    hasMore: true,
    windowEndTime: now,
    minStartTime,
  };
}

function getCurrentWindow(state: OrderPaginationState): { start_time: number; end_time: number } | null {
  if (state.windowEndTime < state.minStartTime) return null;
  return {
    start_time: Math.max(state.minStartTime, state.windowEndTime - ORDER_TIME_WINDOW_SECONDS + 1),
    end_time: state.windowEndTime,
  };
}

function moveToPreviousWindow(state: OrderPaginationState): void {
  const current = getCurrentWindow(state);
  state.nextKey = '';
  state.windowEndTime = current ? current.start_time - 1 : state.minStartTime - 1;
  state.hasMore = state.windowEndTime >= state.minStartTime;
}

async function fetchOrderDetails(
  orderIds: string[],
  getOrderDetail: (orderId: string) => Promise<Order>,
  logger: ReturnType<typeof createLogger>,
): Promise<Order[]> {
  if (orderIds.length === 0) return [];

  const settled = await Promise.allSettled(orderIds.map(orderId => getOrderDetail(orderId)));
  const orders = settled
    .map((result, index) => {
      if (result.status === 'fulfilled') return result.value;
      logger.error(`获取订单 ${orderIds[index]} 详情失败:`, result.reason);
      return null;
    })
    .filter((order): order is Order => order !== null);

  if (orders.length === 0) {
    throw new Error(`订单列表已返回 ${orderIds.length} 个订单号，但订单详情全部获取失败，请稍后重试`);
  }

  return orders;
}

export async function listOrders(
  accountId: string,
  status?: OrderStatus,
  pageSize?: number,
  reset?: boolean,
  timeScope: OrderTimeScope = 'all',
): Promise<{ orders: Order[]; hasMore: boolean }> {
  const logger = createLogger('Orders', accountId);
  const key = `${accountId}:${status ?? 'all'}:${timeScope}`;
  let pag = orderPaginationMap.get(key);
  if (!pag || reset) {
    pag = makePaginationState(timeScope);
    orderPaginationMap.set(key, pag);
  }
  if (!pag.hasMore) return { orders: [], hasMore: false };

  const api = await getClient(accountId);
  let scannedEmptyWindows = 0;

  while (pag.hasMore) {
    const timeRange = getCurrentWindow(pag);
    if (!timeRange) {
      pag.hasMore = false;
      return { orders: [], hasMore: false };
    }

    const params: OrderListParams = {
      page_size: pageSize || 10,
      next_key: pag.nextKey || undefined,
      status,
      create_time_range: timeRange,
    };
    const listResult = await api.getOrderList(params);
    const orders = await fetchOrderDetails(listResult.order_id_list, api.getOrderDetail, logger);

    if (listResult.has_more) {
      pag.nextKey = listResult.next_key;
      pag.hasMore = true;
      return { orders, hasMore: true };
    }

    moveToPreviousWindow(pag);
    if (orders.length > 0) return { orders, hasMore: pag.hasMore };

    scannedEmptyWindows += 1;
    if (scannedEmptyWindows >= MAX_EMPTY_WINDOWS_PER_REQUEST) {
      return { orders: [], hasMore: pag.hasMore };
    }
  }

  return { orders: [], hasMore: false };
}

export async function searchOrders(accountId: string, params: OrderSearchParams): Promise<{ orders: Order[]; hasMore: boolean }> {
  const logger = createLogger('Orders', accountId);
  const api = await getClient(accountId);
  const listResult = await api.searchOrders(params);
  const orders = await fetchOrderDetails(listResult.order_id_list, api.getOrderDetail, logger);
  return { orders, hasMore: listResult.has_more };
}
