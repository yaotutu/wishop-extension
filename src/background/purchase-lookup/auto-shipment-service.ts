import type { PurchaseLookupSession, TaobaoPurchaseOrderSnapshot } from '../../shared/types';
import { recordActivityFailed } from '../activity-logs/activity-log-service.ts';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';
import { shipOrderFromPurchase } from '../services/order-delivery-service';
import { getAppSettings } from '../store/settings-repository';
import { getOrdersClient } from '../wxshop/client-registry';
import { evaluateAutoShipmentDecision, type AutoShipmentDecision } from './auto-shipment-decision';

function logAutoShipmentSkip(
  session: PurchaseLookupSession,
  decision: Extract<AutoShipmentDecision, { action: 'skip' }>,
): void {
  if (decision.code !== 'wx_order_not_shippable') return;
  createDiagnosticLogger({ domain: 'orders', component: 'AutoShipment', accountId: session.accountId }).info(
    '自动发货跳过：微信订单当前不可发货',
    {
      orderId: session.orderId,
      platformOrderId: session.platformOrderId,
      reason: decision.reason,
      wxOrderStatus: decision.wxOrder?.status,
      deliveryCount: decision.wxOrder?.order_detail?.delivery_info?.delivery_product_info?.length || 0,
    },
  );
}

async function recordAutoShipmentFailed(
  session: PurchaseLookupSession,
  error: string,
): Promise<void> {
  await recordActivityFailed({
    domain: 'orders',
    scope: 'account',
    accountId: session.accountId,
    trigger: 'background',
    runId: `ship-${session.orderId}-${Date.now()}`,
    title: '自动发货失败',
    error: { message: error },
    notification: {
      topic: 'orders.auto_shipment_failed',
      urgency: 'important',
    },
    metadata: {
      orderId: session.orderId,
      platformOrderId: session.platformOrderId,
      source: 'purchaseLookup',
    },
  });
}

export async function maybeAutoShipFromPurchase(
  session: PurchaseLookupSession,
  snapshot: TaobaoPurchaseOrderSnapshot,
): Promise<void> {
  const settings = (await getAppSettings()).shipmentCheck;
  const decision = await evaluateAutoShipmentDecision({
    settings,
    snapshot,
    readWxOrder: async () => (await getOrdersClient(session.accountId)).getOrderDetail(session.orderId),
  });

  if (decision.action === 'skip') {
    logAutoShipmentSkip(session, decision);
    return;
  }

  if (decision.action === 'fail') {
    await recordAutoShipmentFailed(session, decision.error);
    return;
  }

  try {
    await shipOrderFromPurchase({
      accountId: session.accountId,
      orderId: session.orderId,
      logisticsCompany: decision.logisticsCompany,
      trackingNumber: decision.trackingNumber,
      sourceAction: 'auto',
    }, {
      wxOrder: decision.wxOrder,
    });
  } catch {
    // shipOrderFromPurchase records the user-facing failure notification.
  }
}
