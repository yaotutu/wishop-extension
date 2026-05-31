import assert from 'node:assert/strict';
import test from 'node:test';
import { detectTaobaoPageType } from '../src/content/taobao/adapters/page-adapter.ts';

test('detects Taobao and Tmall checkout pages', () => {
  assert.equal(
    detectTaobaoPageType('https://buy.taobao.com/auction/buy_now.jhtml?itemId=123'),
    'checkout',
  );

  assert.equal(
    detectTaobaoPageType('https://buy.taobao.com/auction/order/confirm_order.htm?itemId=123'),
    'checkout',
  );

  assert.equal(
    detectTaobaoPageType('https://buy.tmall.com/order/confirm_order.htm?itemId=123'),
    'checkout',
  );
});

test('detects Taobao product detail pages', () => {
  assert.equal(
    detectTaobaoPageType('https://item.taobao.com/item.htm?id=123'),
    'product-detail',
  );
});
