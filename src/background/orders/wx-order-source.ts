import type { Order, OrderListParams, OrderSearchParams } from '../../shared/types';
import { getClient } from '../wxshop/client-registry';
import { getRecentOrderWindow, makeRecentOrderWindowState, moveRecentOrderWindowBack } from './recent-order-window';

const MAX_EMPTY_RECENT_WINDOWS = 5;

async function fetchOrderDetails(
  orderIds: string[],
  getOrderDetail: (orderId: string) => Promise<Order>,
): Promise<Order[]> {
  if (orderIds.length === 0) return [];
  const settled = await Promise.allSettled(orderIds.map(orderId => getOrderDetail(orderId)));
  return settled
    .map(result => result.status === 'fulfilled' ? result.value : null)
    .filter((order): order is Order => order !== null);
}

export interface WxOrderSource {
  fetchRecentOrders(accountId: string): Promise<Order[]>;
  searchOrders(accountId: string, params: OrderSearchParams): Promise<Order[]>;
  getOrderDetail(accountId: string, orderId: string): Promise<Order>;
}

export function createWxOrderSource(): WxOrderSource {
  return {
    async fetchRecentOrders(accountId: string): Promise<Order[]> {
      const api = await getClient(accountId);
      const state = makeRecentOrderWindowState();
      let scannedEmptyWindows = 0;

      while (scannedEmptyWindows < MAX_EMPTY_RECENT_WINDOWS) {
        const timeRange = getRecentOrderWindow(state);
        if (!timeRange) return [];
        const params: OrderListParams = {
          page_size: 50,
          create_time_range: timeRange,
        };
        const listResult = await api.getOrderList(params);
        const orders = await fetchOrderDetails(listResult.order_id_list, api.getOrderDetail);
        if (orders.length > 0 || listResult.has_more) return orders;
        scannedEmptyWindows += 1;
        moveRecentOrderWindowBack(state);
      }

      return [];
    },

    async searchOrders(accountId: string, params: OrderSearchParams): Promise<Order[]> {
      const api = await getClient(accountId);
      const listResult = await api.searchOrders(params);
      return fetchOrderDetails(listResult.order_id_list, api.getOrderDetail);
    },

    async getOrderDetail(accountId: string, orderId: string): Promise<Order> {
      return (await getClient(accountId)).getOrderDetail(orderId);
    },
  };
}
