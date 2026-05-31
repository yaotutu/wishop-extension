import assert from 'node:assert/strict';
import test from 'node:test';
import type { Order } from '../src/shared/types.ts';
import { OrderStatus } from '../src/shared/types.ts';
import { getOrderDeliveryBlockReason } from '../src/background/services/order-delivery-service.ts';

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

test('blocks delivery submission when WeChat order is no longer pending shipment', () => {
  const reason = getOrderDeliveryBlockReason(makeOrder({ status: OrderStatus.PendingReceipt }));

  assert.equal(reason, '当前微信小店订单不是待发货状态，无法提交发货');
});

test('blocks delivery submission when WeChat order already has logistics', () => {
  const reason = getOrderDeliveryBlockReason(makeOrder({
    order_detail: {
      ...makeOrder().order_detail,
      delivery_info: {
        ...makeOrder().order_detail.delivery_info,
        delivery_product_info: [{
          delivery_id: 'SF',
          delivery_name: '顺丰',
          waybill_id: 'SF123456789',
          delivery_time: 1700000100,
        }],
      },
    },
  }));

  assert.equal(reason, '当前微信小店订单已有物流信息，请勿重复发货');
});

test('allows delivery submission when WeChat order is still pending shipment without logistics', () => {
  assert.equal(getOrderDeliveryBlockReason(makeOrder()), null);
});
