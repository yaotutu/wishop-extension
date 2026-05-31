import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SHIPMENT_CHECK_SETTINGS } from '../src/shared/settings.ts';
import type { Order, TaobaoPurchaseOrderSnapshot } from '../src/shared/types.ts';
import { OrderStatus } from '../src/shared/types.ts';
import { evaluateAutoShipmentDecision } from '../src/background/purchase-lookup/auto-shipment-decision.ts';

function makeOrder(patch: Partial<Order> = {}): Order {
  return {
    order_id: 'order-1',
    status: OrderStatus.PendingShipment,
    create_time: 1700000000,
    update_time: 1700000000,
    order_detail: {
      product_infos: [],
      price_info: {
        product_price: 0,
        order_price: 0,
        freight: 0,
        discounted_price: 0,
        original_order_price: 0,
        merchant_receieve_price: 0,
      },
      pay_info: { pay_time: 0, transaction_id: '', payment_method: 0 },
      delivery_info: {
        address_info: {
          user_name: '',
          postal_code: '',
          province_name: '',
          city_name: '',
          county_name: '',
          detail_info: '',
          tel_number: '',
          house_number: '',
        },
        delivery_product_info: [],
        ship_done_time: 0,
        deliver_method: 0,
      },
      ext_info: { customer_notes: '', merchant_notes: '', confirm_receipt_time: 0 },
    },
    ...patch,
  };
}

function makeSnapshot(patch: Partial<TaobaoPurchaseOrderSnapshot> = {}): TaobaoPurchaseOrderSnapshot {
  return {
    platformOrderId: 'tb-1',
    platformOrderStatus: '卖家已发货',
    logisticsStatus: '运输中',
    logisticsCompany: '顺丰',
    trackingNumber: 'SF123456789',
    ...patch,
  };
}

test('auto shipment decision skips when WeChat order is already pending receipt', async () => {
  const decision = await evaluateAutoShipmentDecision({
    settings: { ...DEFAULT_SHIPMENT_CHECK_SETTINGS, autoShipEnabled: true },
    snapshot: makeSnapshot(),
    readWxOrder: async () => makeOrder({ status: OrderStatus.PendingReceipt }),
  });

  assert.equal(decision.action, 'skip');
  assert.equal(decision.code, 'wx_order_not_shippable');
  assert.equal(decision.reason, '当前微信小店订单不是待发货状态，无法提交发货');
});

test('auto shipment decision fails when WeChat order cannot be read', async () => {
  const decision = await evaluateAutoShipmentDecision({
    settings: { ...DEFAULT_SHIPMENT_CHECK_SETTINGS, autoShipEnabled: true },
    snapshot: makeSnapshot(),
    readWxOrder: async () => {
      throw new Error('token expired');
    },
  });

  assert.equal(decision.action, 'fail');
  assert.equal(decision.code, 'wx_order_read_failed');
  assert.equal(decision.error, 'token expired');
});

test('auto shipment decision submits only with purchase logistics and shippable WeChat order', async () => {
  const wxOrder = makeOrder();
  const decision = await evaluateAutoShipmentDecision({
    settings: { ...DEFAULT_SHIPMENT_CHECK_SETTINGS, autoShipEnabled: true },
    snapshot: makeSnapshot(),
    readWxOrder: async () => wxOrder,
  });

  assert.equal(decision.action, 'submit');
  assert.equal(decision.wxOrder, wxOrder);
  assert.equal(decision.logisticsCompany, '顺丰');
  assert.equal(decision.trackingNumber, 'SF123456789');
});
