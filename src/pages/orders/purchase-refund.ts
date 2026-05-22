import type { LinkedPlatformOrder, Order } from '../../shared/types';
import { OrderStatus as OrderStatusEnum } from '../../shared/types';
import { normalizeLinkedPurchaseOrder } from '../../shared/purchase-status';

const PURCHASE_LOGISTICS_STATUS_KEYWORDS = [
  '卖家已发货',
  '已发货',
  '已揽收',
  '运输中',
  '派送中',
  '已签收',
  '交易成功',
  '退款中',
  '退款成功',
];

const PURCHASE_REFUND_TERMINAL_STATUS_KEYWORDS = [
  '交易关闭',
  '退款成功',
  '退货退款成功',
];

export function hasLinkedPurchaseLogistics(linked?: LinkedPlatformOrder): boolean {
  if (!linked) return false;
  const normalized = normalizeLinkedPurchaseOrder(linked);
  const logisticsFields = [
    normalized.logisticsCompany,
    normalized.trackingNumber,
    normalized.logisticsStatus,
  ].map(value => value?.trim()).filter(Boolean);
  if (logisticsFields.length > 0) return true;

  const status = normalized.platformOrderStatus?.trim() || '';
  return PURCHASE_LOGISTICS_STATUS_KEYWORDS.some(keyword => status.includes(keyword));
}

export function isLinkedPurchaseRefundFinished(linked?: LinkedPlatformOrder): boolean {
  const status = linked ? normalizeLinkedPurchaseOrder(linked).platformOrderStatus?.trim() || '' : '';
  return PURCHASE_REFUND_TERMINAL_STATUS_KEYWORDS.some(keyword => status.includes(keyword));
}

export function canPrepareTaobaoRefund(order: Order, linked?: LinkedPlatformOrder): boolean {
  return order.status === OrderStatusEnum.CancelledByAfterSale
    && linked?.platform === 'taobao'
    && !!linked.platformOrderId?.trim()
    && !isLinkedPurchaseRefundFinished(linked);
}
