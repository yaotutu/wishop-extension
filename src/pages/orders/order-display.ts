import type { Order, OrderProductInfo } from '../../shared/types';
import { OrderStatus as OrderStatusEnum } from '../../shared/types';

export const STATUS_CONFIG: Record<number, { color: string; text: string }> = {
  [OrderStatusEnum.PendingPayment]: { color: 'orange', text: '待付款' },
  [OrderStatusEnum.GiftPendingAccept]: { color: 'purple', text: '礼物待收下' },
  [OrderStatusEnum.GroupBuying]: { color: 'cyan', text: '凑单中' },
  [OrderStatusEnum.PendingShipment]: { color: 'blue', text: '待发货' },
  [OrderStatusEnum.PartialShipment]: { color: 'geekblue', text: '部分发货' },
  [OrderStatusEnum.PendingReceipt]: { color: 'cyan', text: '待收货' },
  [OrderStatusEnum.Completed]: { color: 'green', text: '已完成' },
  [OrderStatusEnum.CancelledByAfterSale]: { color: 'red', text: '售后取消' },
  [OrderStatusEnum.CancelledByUser]: { color: 'default', text: '已取消' },
};

export const PAYMENT_METHOD: Record<number, string> = {
  1: '微信支付',
  2: '先用后付',
  3: '0元抽奖',
  4: '积分兑换',
};

export function formatTime(timestamp: number): string {
  if (!timestamp) return '-';
  const d = new Date(timestamp * 1000);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatPrice(cents: number): string {
  if (cents === undefined || cents === null) return '-';
  return `¥${(cents / 100).toFixed(2)}`;
}

export const firstProduct = (order: Order): OrderProductInfo | undefined =>
  order.order_detail?.product_infos?.[0];

export const hasAddressInfo = (order: Order): boolean =>
  !!order.order_detail?.delivery_info?.address_info;
