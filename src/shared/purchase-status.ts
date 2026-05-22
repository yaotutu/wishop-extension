import type { LinkedPlatformOrder } from './types';

const PAYMENT_SUCCESS_PLACEHOLDER_STATUS = '支付成功';
const PAYMENT_SUCCESS_PLACEHOLDER_LOGISTICS_STATUS = '待发货';
const PAYMENT_SUCCESS_PLACEHOLDER_REMARK = '支付成功页自动关联';
export const PAID_TAOBAO_ASSOCIATION_REMARK = '淘宝付款完成页自动关联';

export function normalizePurchaseOrderStatus(status?: string): string {
  const value = status?.trim() || '';
  return value === PAYMENT_SUCCESS_PLACEHOLDER_STATUS ? '' : value;
}

export function normalizePurchaseLogisticsStatus(logisticsStatus?: string, platformOrderStatus?: string): string {
  const value = logisticsStatus?.trim() || '';
  const status = platformOrderStatus?.trim() || '';
  if (status === PAYMENT_SUCCESS_PLACEHOLDER_STATUS && value === PAYMENT_SUCCESS_PLACEHOLDER_LOGISTICS_STATUS) return '';
  return value;
}

export function normalizePurchaseRemark(remark?: string): string {
  const value = remark?.trim() || '';
  return value === PAYMENT_SUCCESS_PLACEHOLDER_REMARK ? PAID_TAOBAO_ASSOCIATION_REMARK : value;
}

export function normalizeLinkedPurchaseOrder(linked: LinkedPlatformOrder): LinkedPlatformOrder {
  return {
    ...linked,
    platformOrderStatus: normalizePurchaseOrderStatus(linked.platformOrderStatus),
    logisticsStatus: normalizePurchaseLogisticsStatus(linked.logisticsStatus, linked.platformOrderStatus),
    remark: normalizePurchaseRemark(linked.remark),
  };
}
