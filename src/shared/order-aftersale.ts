import type {
  AfterSaleOrderStatus,
  Order,
  OrderAftersaleSummary,
  OrderAftersaleSummaryItem,
  WxAfterSaleOrder,
} from './types';

export const AFTERSALE_STATUS_TEXT: Record<string, string> = {
  USER_CANCELD: '用户取消申请',
  MERCHANT_PROCESSING: '商家受理中',
  MERCHANT_REJECT_REFUND: '商家拒绝退款',
  MERCHANT_REJECT_RETURN: '商家拒绝退货退款',
  USER_WAIT_RETURN: '待买家退货',
  RETURN_CLOSED: '退货退款关闭',
  MERCHANT_WAIT_RECEIPT: '待商家收货',
  MERCHANT_OVERDUE_REFUND: '商家逾期未退款',
  MERCHANT_REFUND_SUCCESS: '退款完成',
  MERCHANT_RETURN_SUCCESS: '退货退款完成',
  PLATFORM_REFUNDING: '平台退款中',
  PLATFORM_REFUND_FAIL: '平台退款失败',
  USER_WAIT_CONFIRM: '待用户确认',
  MERCHANT_REFUND_RETRY_FAIL: '商家打款失败，客服关闭售后',
  MERCHANT_FAIL: '售后关闭',
  USER_WAIT_CONFIRM_UPDATE: '待用户处理商家协商',
  USER_WAIT_HANDLE_MERCHANT_AFTER_SALE: '待用户处理商家代发起的售后申请',
  WAIT_PACKAGE_INTERCEPT: '物流线上拦截中',
  MERCHANT_REJECT_EXCHANGE: '商家拒绝换货',
  MERCHANT_REJECT_RESHIP: '商家拒绝发货',
  USER_WAIT_RECEIPT: '待用户收货',
  MERCHANT_EXCHANGE_SUCCESS: '换货完成',
};

const COMPLETED_AFTERSALE_STATUSES = new Set<AfterSaleOrderStatus>([
  'MERCHANT_REFUND_SUCCESS',
  'MERCHANT_RETURN_SUCCESS',
  'MERCHANT_EXCHANGE_SUCCESS',
]);

const CLOSED_AFTERSALE_STATUSES = new Set<AfterSaleOrderStatus>([
  'USER_CANCELD',
  'RETURN_CLOSED',
  'MERCHANT_FAIL',
  'MERCHANT_REFUND_RETRY_FAIL',
]);

const REJECTED_AFTERSALE_STATUSES = new Set<AfterSaleOrderStatus>([
  'MERCHANT_REJECT_REFUND',
  'MERCHANT_REJECT_RETURN',
  'MERCHANT_REJECT_EXCHANGE',
  'MERCHANT_REJECT_RESHIP',
  'PLATFORM_REFUND_FAIL',
]);

function sumOrderProductCount(order: Order, field: 'on_aftersale_sku_cnt' | 'finish_aftersale_sku_cnt'): number {
  return (order.order_detail?.product_infos || [])
    .reduce((total, product) => total + (Number(product[field]) || 0), 0);
}

export function orderAftersaleOrderIds(order: Order): string[] {
  // 订单详情里的 aftersale_order_list.status 官方已废弃，不能拿来展示状态；
  // 这里只取 aftersale_order_id，用它去调用售后详情接口拿正式状态。
  const ids = order.aftersale_detail?.aftersale_order_list
    ?.map(item => String(item.aftersale_order_id || '').trim())
    .filter(Boolean) || [];
  return [...new Set(ids)];
}

export function orderHasAftersaleSignal(order: Order): boolean {
  return Number(order.aftersale_detail?.on_aftersale_order_cnt || 0) > 0
    || orderAftersaleOrderIds(order).length > 0
    || sumOrderProductCount(order, 'on_aftersale_sku_cnt') > 0
    || sumOrderProductCount(order, 'finish_aftersale_sku_cnt') > 0;
}

export function aftersaleStatusText(status?: AfterSaleOrderStatus): string {
  if (!status) return '售后中';
  return AFTERSALE_STATUS_TEXT[status] || status;
}

function aftersaleStatusWeight(status?: AfterSaleOrderStatus): number {
  if (!status) return 20;
  if (COMPLETED_AFTERSALE_STATUSES.has(status)) return 10;
  if (CLOSED_AFTERSALE_STATUSES.has(status)) return 5;
  if (REJECTED_AFTERSALE_STATUSES.has(status)) return 15;
  return 30;
}

function pickPrimaryItem(items: OrderAftersaleSummaryItem[]): OrderAftersaleSummaryItem | undefined {
  return [...items].sort((a, b) => (
    aftersaleStatusWeight(b.status) - aftersaleStatusWeight(a.status)
    || (b.updateTime || 0) - (a.updateTime || 0)
  ))[0];
}

export function buildOrderAftersaleSummary(
  order: Order,
  aftersaleOrders: WxAfterSaleOrder[],
  detailFetchFailed = false,
): OrderAftersaleSummary | undefined {
  if (!orderHasAftersaleSignal(order)) return undefined;

  const onAftersaleOrderCount = Number(order.aftersale_detail?.on_aftersale_order_cnt || 0);
  const onAftersaleSkuCount = sumOrderProductCount(order, 'on_aftersale_sku_cnt');
  const finishAftersaleSkuCount = sumOrderProductCount(order, 'finish_aftersale_sku_cnt');
  const items = aftersaleOrders.map((aftersale): OrderAftersaleSummaryItem => ({
    afterSaleOrderId: aftersale.after_sale_order_id,
    status: aftersale.status,
    statusText: aftersaleStatusText(aftersale.status),
    type: aftersale.type,
    productId: aftersale.product_info?.product_id,
    skuId: aftersale.product_info?.sku_id,
    count: aftersale.product_info?.count,
    updateTime: aftersale.update_time,
    completeTime: aftersale.complete_time,
  }));
  const primary = pickPrimaryItem(items);

  return {
    hasAftersale: true,
    status: primary?.status,
    statusText: primary?.statusText || (onAftersaleOrderCount > 0 || onAftersaleSkuCount > 0 ? '售后中' : '售后完成'),
    onAftersaleOrderCount,
    onAftersaleSkuCount,
    finishAftersaleSkuCount,
    items,
    detailFetchFailed: detailFetchFailed || undefined,
  };
}

export interface OrderAftersaleDisplay {
  text: string;
  color: string;
  title: string;
}

function colorForAftersaleStatus(status?: AfterSaleOrderStatus): string {
  if (!status) return 'orange';
  if (COMPLETED_AFTERSALE_STATUSES.has(status)) return 'green';
  if (CLOSED_AFTERSALE_STATUSES.has(status)) return 'default';
  if (REJECTED_AFTERSALE_STATUSES.has(status)) return 'red';
  return 'orange';
}

export function getOrderAftersaleDisplay(order: Order): OrderAftersaleDisplay | null {
  const summary = order.aftersale_summary || buildOrderAftersaleSummary(order, []);
  if (!summary) return null;
  const parts = [
    `进行中售后单：${summary.onAftersaleOrderCount}`,
    `售后中商品：${summary.onAftersaleSkuCount}`,
    `售后完成商品：${summary.finishAftersaleSkuCount}`,
  ];
  if (summary.detailFetchFailed) parts.push('售后详情获取失败，当前展示为订单内售后标记');
  return {
    text: summary.statusText,
    color: colorForAftersaleStatus(summary.status),
    title: parts.join('，'),
  };
}
