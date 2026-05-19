import type { Order, OrderListParams, OrderSearchParams, OrderStatus } from '../../shared/types';
import { getClient } from '../wxshop/client-registry';
import { createLogger } from '../utils/logger';

interface OrderPaginationState {
  nextKey: string;
  hasMore: boolean;
  timeRange?: { start_time: number; end_time: number };
}

const orderPaginationMap = new Map<string, OrderPaginationState>();

function makeTimeRange(): { start_time: number; end_time: number } {
  const now = Math.floor(Date.now() / 1000);
  return { start_time: now - 7 * 24 * 3600, end_time: now };
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
): Promise<{ orders: Order[]; hasMore: boolean }> {
  const logger = createLogger('Orders', accountId);
  const key = `${accountId}:${status ?? 'all'}`;
  let pag = orderPaginationMap.get(key);
  if (!pag || reset) {
    pag = { nextKey: '', hasMore: true, timeRange: makeTimeRange() };
    orderPaginationMap.set(key, pag);
  }
  if (!pag.hasMore) return { orders: [], hasMore: false };

  const api = await getClient(accountId);
  const params: OrderListParams = {
    page_size: pageSize || 10,
    next_key: pag.nextKey || undefined,
    status,
    update_time_range: pag.timeRange,
  };
  const listResult = await api.getOrderList(params);
  const orders = await fetchOrderDetails(listResult.order_id_list, api.getOrderDetail, logger);

  pag.nextKey = listResult.next_key;
  pag.hasMore = listResult.has_more;
  return { orders, hasMore: pag.hasMore };
}

export async function searchOrders(accountId: string, params: OrderSearchParams): Promise<{ orders: Order[]; hasMore: boolean }> {
  const logger = createLogger('Orders', accountId);
  const api = await getClient(accountId);
  const listResult = await api.searchOrders(params);
  const orders = await fetchOrderDetails(listResult.order_id_list, api.getOrderDetail, logger);
  return { orders, hasMore: listResult.has_more };
}
