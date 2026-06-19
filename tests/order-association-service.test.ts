import assert from 'node:assert/strict';
import test from 'node:test';
import type { Order } from '../src/shared/types.ts';
import { extractTaobaoOrderIdFromMerchantNotes } from '../src/shared/taobao-order-id-extractor.ts';
import { compareLinkPriority, isSourceEnabled } from '../src/shared/purchase-link-priority.ts';
import {
  normalizePurchaseLinkSettings,
  DEFAULT_PURCHASE_LINK_SETTINGS,
  LINK_SOURCE_DEFAULT_ORDER,
} from '../src/shared/settings.ts';
import type { PurchaseLinkSettings, PurchaseLinkSourceId } from '../src/shared/settings.ts';

// 用纯数字构造订单，避免导入 OrderStatus enum 触发 node strip-types 的 enum 解析限制。
function makeOrder(merchantNotes: string): Order {
  return {
    order_id: 'order-1',
    status: 20 as Order['status'],
    create_time: 1700000000,
    update_time: 1700000000,
    order_detail: {
      product_infos: [],
      price_info: {
        order_price: 0,
        freight: 0,
        discounted_price: 0,
        additional_price: 0,
        additional_discounted_price: 0,
      } as never,
      settle_info: {} as never,
      pay_info: { pay_time: 0, transaction_id: '', payment_method: 0 },
      delivery_info: {
        address_info: {
          house_number: '',
          tel_number: '',
        } as never,
        delivery_product_info: [],
        ship_done_time: 0,
        deliver_method: 0,
      },
      ext_info: { customer_notes: '', merchant_notes: merchantNotes, confirm_receipt_time: 0 },
    },
  };
}

test('extractTaobaoOrderIdFromMerchantNotes returns the first 15-20 digit order id', () => {
  const order = makeOrder('淘宝采购单 1234567890123456789');
  assert.equal(extractTaobaoOrderIdFromMerchantNotes(order), '1234567890123456789');
});

test('extractTaobaoOrderIdFromMerchantNotes ignores short numbers like phone numbers', () => {
  const order = makeOrder('联系电话 13812345678 淘宝单 123456789012345');
  assert.equal(extractTaobaoOrderIdFromMerchantNotes(order), '123456789012345');
});

test('extractTaobaoOrderIdFromMerchantNotes returns null when notes are empty', () => {
  const order = makeOrder('');
  assert.equal(extractTaobaoOrderIdFromMerchantNotes(order), null);
});

test('extractTaobaoOrderIdFromMerchantNotes returns null when no matching number exists', () => {
  const order = makeOrder('没有采购单号的备注');
  assert.equal(extractTaobaoOrderIdFromMerchantNotes(order), null);
});

test('extractTaobaoOrderIdFromMerchantNotes picks the first match when multiple long numbers exist', () => {
  const order = makeOrder('单号1 123456789012345 单号2 987654321098765');
  assert.equal(extractTaobaoOrderIdFromMerchantNotes(order), '123456789012345');
});

const DEFAULT_SETTINGS: PurchaseLinkSettings = {
  sourceOrder: ['manual', 'merchant_notes', 'payment_success'],
  enabledSources: ['merchant_notes', 'payment_success'],
};

test('compareLinkPriority returns negative when candidate has higher priority', () => {
  const result = compareLinkPriority(DEFAULT_SETTINGS, 'manual', 'payment_success');
  assert.ok(result < 0);
});

test('compareLinkPriority returns positive when candidate has lower priority', () => {
  const result = compareLinkPriority(DEFAULT_SETTINGS, 'payment_success', 'manual');
  assert.ok(result > 0);
});

test('compareLinkPriority returns zero when sources are equal', () => {
  const result = compareLinkPriority(DEFAULT_SETTINGS, 'merchant_notes', 'merchant_notes');
  assert.equal(result, 0);
});

test('higher priority source should be written (manual overrides merchant_notes)', () => {
  const result = compareLinkPriority(DEFAULT_SETTINGS, 'manual', 'merchant_notes');
  assert.ok(result <= 0);
});

test('lower priority source should be skipped (payment_success cannot override manual)', () => {
  const result = compareLinkPriority(DEFAULT_SETTINGS, 'payment_success', 'manual');
  assert.ok(result > 0);
});

test('user reordered priority changes which source wins', () => {
  const reordered: PurchaseLinkSettings = {
    sourceOrder: ['manual', 'payment_success', 'merchant_notes'],
    enabledSources: ['merchant_notes', 'payment_success'],
  };
  const result = compareLinkPriority(reordered, 'payment_success', 'merchant_notes');
  assert.ok(result < 0, 'payment_success should win after user reordered it higher');
});

test('isSourceEnabled always returns true for manual', () => {
  const settingsWithoutManual: PurchaseLinkSettings = {
    sourceOrder: ['manual', 'merchant_notes', 'payment_success'],
    enabledSources: [],
  };
  assert.equal(isSourceEnabled(settingsWithoutManual, 'manual'), true);
});

test('isSourceEnabled returns false when source is disabled', () => {
  const disabled: PurchaseLinkSettings = {
    sourceOrder: ['manual', 'merchant_notes', 'payment_success'],
    enabledSources: ['merchant_notes'],
  };
  assert.equal(isSourceEnabled(disabled, 'payment_success'), false);
});

test('isSourceEnabled returns true when source is enabled', () => {
  assert.equal(isSourceEnabled(DEFAULT_SETTINGS, 'merchant_notes'), true);
  assert.equal(isSourceEnabled(DEFAULT_SETTINGS, 'payment_success'), true);
});

test('normalizePurchaseLinkSettings returns defaults when no input', () => {
  const result = normalizePurchaseLinkSettings();
  assert.deepEqual(result, DEFAULT_PURCHASE_LINK_SETTINGS);
  assert.deepEqual(result.sourceOrder, LINK_SOURCE_DEFAULT_ORDER);
});

test('normalizePurchaseLinkSettings appends missing sources to the end', () => {
  const result = normalizePurchaseLinkSettings({
    sourceOrder: ['merchant_notes'],
    enabledSources: ['merchant_notes'],
  });
  assert.equal(result.sourceOrder[0], 'merchant_notes');
  assert.ok(result.sourceOrder.includes('manual'));
  assert.ok(result.sourceOrder.includes('payment_success'));
  assert.equal(result.sourceOrder.length, 3);
});

test('normalizePurchaseLinkSettings removes manual from enabledSources', () => {
  const result = normalizePurchaseLinkSettings({
    sourceOrder: ['manual', 'merchant_notes', 'payment_success'],
    enabledSources: ['manual', 'merchant_notes', 'payment_success'],
  });
  assert.ok(!result.enabledSources.includes('manual'));
  assert.ok(result.enabledSources.includes('merchant_notes'));
  assert.ok(result.enabledSources.includes('payment_success'));
});

test('normalizePurchaseLinkSettings deduplicates sources', () => {
  const result = normalizePurchaseLinkSettings({
    sourceOrder: ['manual', 'manual', 'merchant_notes'],
    enabledSources: ['merchant_notes', 'merchant_notes'],
  });
  assert.equal(result.sourceOrder.filter(id => id === 'manual').length, 1);
  assert.equal(result.enabledSources.filter(id => id === 'merchant_notes').length, 1);
});

test('normalizePurchaseLinkSettings filters out unknown source ids', () => {
  const result = normalizePurchaseLinkSettings({
    sourceOrder: ['manual', 'unknown_source' as PurchaseLinkSourceId, 'merchant_notes'],
    enabledSources: ['unknown_source' as PurchaseLinkSourceId, 'payment_success'],
  });
  assert.ok(!result.sourceOrder.includes('unknown_source' as PurchaseLinkSourceId));
  assert.ok(!result.enabledSources.includes('unknown_source' as PurchaseLinkSourceId));
});
