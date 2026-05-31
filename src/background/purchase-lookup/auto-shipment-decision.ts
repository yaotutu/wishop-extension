import type { ShipmentCheckSettings } from '../../shared/settings';
import type { Order, TaobaoPurchaseOrderSnapshot } from '../../shared/types';
import { getOrderDeliveryBlockReason } from '../services/order-delivery-service';

export type AutoShipmentSkipCode =
  | 'disabled'
  | 'missing_purchase_logistics'
  | 'wx_order_not_shippable';

export type AutoShipmentFailCode = 'wx_order_read_failed';

export type AutoShipmentDecision =
  | {
    action: 'skip';
    code: AutoShipmentSkipCode;
    reason: string;
    wxOrder?: Order;
    logisticsCompany?: string;
    trackingNumber?: string;
  }
  | {
    action: 'fail';
    code: AutoShipmentFailCode;
    error: string;
    logisticsCompany: string;
    trackingNumber: string;
  }
  | {
    action: 'submit';
    wxOrder: Order;
    logisticsCompany: string;
    trackingNumber: string;
  };

export interface EvaluateAutoShipmentInput {
  settings: ShipmentCheckSettings;
  snapshot: TaobaoPurchaseOrderSnapshot;
  readWxOrder: () => Promise<Order>;
}

export async function evaluateAutoShipmentDecision(input: EvaluateAutoShipmentInput): Promise<AutoShipmentDecision> {
  if (!input.settings.autoShipEnabled) {
    return {
      action: 'skip',
      code: 'disabled',
      reason: '自动发货未开启',
    };
  }

  const logisticsCompany = input.snapshot.logisticsCompany?.trim() || '';
  const trackingNumber = input.snapshot.trackingNumber?.trim() || '';
  if (!logisticsCompany || !trackingNumber) {
    return {
      action: 'skip',
      code: 'missing_purchase_logistics',
      reason: '淘宝采购单缺少快递公司或快递单号',
      logisticsCompany,
      trackingNumber,
    };
  }

  let wxOrder: Order;
  try {
    wxOrder = await input.readWxOrder();
  } catch (error) {
    return {
      action: 'fail',
      code: 'wx_order_read_failed',
      error: error instanceof Error ? error.message : '读取微信小店订单失败',
      logisticsCompany,
      trackingNumber,
    };
  }

  const blockReason = getOrderDeliveryBlockReason(wxOrder);
  if (blockReason) {
    return {
      action: 'skip',
      code: 'wx_order_not_shippable',
      reason: blockReason,
      wxOrder,
      logisticsCompany,
      trackingNumber,
    };
  }

  return {
    action: 'submit',
    wxOrder,
    logisticsCompany,
    trackingNumber,
  };
}
