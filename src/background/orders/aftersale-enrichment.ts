import type { Order, WxAfterSaleOrder } from '../../shared/types';
import {
  buildOrderAftersaleSummary,
  orderAftersaleOrderIds,
  orderHasAftersaleSignal,
} from '../../shared/order-aftersale.ts';

interface AfterSaleDetailApi {
  getAfterSaleOrder(afterSaleOrderId: string): Promise<WxAfterSaleOrder>;
}

interface AfterSaleEnrichmentLogger {
  warn(message: string, ...args: unknown[]): void;
}

export interface EnrichOrderAftersaleOptions extends AfterSaleDetailApi {
  logger?: AfterSaleEnrichmentLogger;
}

export async function enrichOrderAftersale(order: Order, options: EnrichOrderAftersaleOptions): Promise<Order> {
  if (!orderHasAftersaleSignal(order)) return order;

  const afterSaleOrderIds = orderAftersaleOrderIds(order);
  const aftersaleOrders: WxAfterSaleOrder[] = [];
  let detailFetchFailed = false;

  for (const afterSaleOrderId of afterSaleOrderIds) {
    try {
      aftersaleOrders.push(await options.getAfterSaleOrder(afterSaleOrderId));
    } catch (error) {
      detailFetchFailed = true;
      options.logger?.warn('售后详情获取失败，订单将保留通用售后标记', {
        orderId: order.order_id,
        afterSaleOrderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ...order,
    aftersale_summary: buildOrderAftersaleSummary(order, aftersaleOrders, detailFetchFailed),
  };
}
