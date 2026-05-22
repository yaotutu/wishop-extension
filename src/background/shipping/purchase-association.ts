import { v4 as uuidv4 } from 'uuid';
import type { LinkedPlatformOrder } from '../../shared/types';
import { normalizeLinkedPurchaseOrder, PAID_TAOBAO_ASSOCIATION_REMARK } from '../../shared/purchase-status';

export function buildPaidTaobaoLinkedOrder(
  existingLinked: LinkedPlatformOrder | undefined,
  platformOrderId: string,
  timestamp: number,
  createId: () => string = uuidv4,
): LinkedPlatformOrder {
  const normalizedExisting = existingLinked ? normalizeLinkedPurchaseOrder(existingLinked) : undefined;
  return {
    id: normalizedExisting?.id || createId(),
    platform: 'taobao',
    platformOrderId,
    platformOrderStatus: normalizedExisting?.platformOrderStatus || '',
    logisticsStatus: normalizedExisting?.logisticsStatus || '',
    logisticsCompany: normalizedExisting?.logisticsCompany || '',
    trackingNumber: normalizedExisting?.trackingNumber || '',
    remark: normalizedExisting?.remark || PAID_TAOBAO_ASSOCIATION_REMARK,
    createdAt: normalizedExisting?.createdAt || timestamp,
    updatedAt: timestamp,
  };
}
