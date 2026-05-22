import { v4 as uuidv4 } from 'uuid';
import type { LinkedPlatformOrder, OrderAssociation } from '../../shared/types';
import { normalizeLinkedPurchaseOrder } from '../../shared/purchase-status';
import { getAccount } from './account-repository';
import { updateAccountData } from './core';

function normalizeLinkedOrder(order: Partial<LinkedPlatformOrder>, now: number): LinkedPlatformOrder {
  return normalizeLinkedPurchaseOrder({
    id: order.id || uuidv4(),
    platform: order.platform || 'taobao',
    platformOrderId: order.platformOrderId?.trim() || '',
    platformOrderStatus: order.platformOrderStatus?.trim() || '',
    logisticsStatus: order.logisticsStatus?.trim() || '',
    logisticsCompany: order.logisticsCompany?.trim() || '',
    trackingNumber: order.trackingNumber?.trim() || '',
    remark: order.remark?.trim() || '',
    createdAt: order.createdAt || now,
    updatedAt: now,
  });
}

function normalizeAssociationForRead(association: OrderAssociation): OrderAssociation {
  return {
    ...association,
    linkedOrders: association.linkedOrders.map(normalizeLinkedPurchaseOrder),
  };
}

export async function getOrderAssociations(accountId: string): Promise<OrderAssociation[]> {
  return ((await getAccount(accountId))?.orderAssociations || []).map(normalizeAssociationForRead);
}

export async function setOrderAssociation(
  accountId: string,
  orderId: string,
  input: Pick<OrderAssociation, 'internalRemark' | 'linkedOrders'>,
): Promise<OrderAssociation> {
  const now = Date.now();
  const existing = ((await getAccount(accountId))?.orderAssociations || []).find(item => item.orderId === orderId);
  const linkedOrders = input.linkedOrders
    .map(order => normalizeLinkedOrder(order, now))
    .filter(order => order.platformOrderId || order.platformOrderStatus || order.logisticsStatus || order.logisticsCompany || order.trackingNumber || order.remark);
  const association: OrderAssociation = {
    orderId,
    internalRemark: input.internalRemark.trim(),
    linkedOrders,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await updateAccountData(accountId, account => {
    const associations = account.orderAssociations || [];
    const hasContent = association.internalRemark || association.linkedOrders.length > 0;
    account.orderAssociations = hasContent
      ? [...associations.filter(item => item.orderId !== orderId), association]
      : associations.filter(item => item.orderId !== orderId);
  });

  return association;
}
