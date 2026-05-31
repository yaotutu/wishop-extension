import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichOrderAftersale } from '../src/background/orders/aftersale-enrichment.ts';
import { getOrderAftersaleDisplay } from '../src/shared/order-aftersale.ts';
import type { Order, OrderStatus } from '../src/shared/types.ts';

const PENDING_RECEIPT = 30 as OrderStatus;

function makeOrder(orderId: string, patch: Partial<Order> = {}): Order {
  return {
    order_id: orderId,
    status: PENDING_RECEIPT,
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

test('orders without aftersale signals do not call aftersale detail API', async () => {
  const calls: string[] = [];
  const order = makeOrder('order-1');

  const enriched = await enrichOrderAftersale(order, {
    async getAfterSaleOrder(afterSaleOrderId) {
      calls.push(afterSaleOrderId);
      throw new Error('should not be called');
    },
  });

  assert.equal(enriched.aftersale_summary, undefined);
  assert.deepEqual(calls, []);
});

test('orders with aftersale id are enriched with official aftersale detail status', async () => {
  const calls: string[] = [];
  const order = makeOrder('order-2', {
    aftersale_detail: {
      on_aftersale_order_cnt: 1,
      aftersale_order_list: [
        { aftersale_order_id: 'after-1', status: 8 },
      ],
    },
    order_detail: {
      ...makeOrder('order-2').order_detail,
      product_infos: [
        {
          product_id: 'product-1',
          sku_id: 'sku-1',
          thumb_img: '',
          sku_cnt: 1,
          sale_price: 100,
          title: '测试商品',
          sku_code: '',
          market_price: 100,
          sku_attrs: [],
          real_price: 100,
          estimate_price: 100,
          on_aftersale_sku_cnt: 1,
          finish_aftersale_sku_cnt: 0,
        },
      ],
    },
  });

  const enriched = await enrichOrderAftersale(order, {
    async getAfterSaleOrder(afterSaleOrderId) {
      calls.push(afterSaleOrderId);
      return {
        after_sale_order_id: afterSaleOrderId,
        order_id: 'order-2',
        status: 'MERCHANT_WAIT_RECEIPT',
        type: 'RETURN',
        update_time: 1700000100,
        product_info: {
          product_id: 'product-1',
          sku_id: 'sku-1',
          count: 1,
        },
      };
    },
  });

  assert.deepEqual(calls, ['after-1']);
  assert.equal(enriched.aftersale_summary?.statusText, '待商家收货');
  assert.equal(enriched.aftersale_summary?.items[0].status, 'MERCHANT_WAIT_RECEIPT');
  assert.equal(getOrderAftersaleDisplay(enriched)?.text, '待商家收货');
});

test('aftersale detail failures keep a generic aftersale marker', async () => {
  const order = makeOrder('order-3', {
    aftersale_detail: {
      on_aftersale_order_cnt: 1,
      aftersale_order_list: [
        { aftersale_order_id: 'after-3', status: 8 },
      ],
    },
  });

  const enriched = await enrichOrderAftersale(order, {
    async getAfterSaleOrder() {
      throw new Error('api failed');
    },
  });

  assert.equal(enriched.aftersale_summary?.statusText, '售后中');
  assert.equal(enriched.aftersale_summary?.detailFetchFailed, true);
  assert.equal(getOrderAftersaleDisplay(enriched)?.text, '售后中');
});
