import assert from 'node:assert/strict';
import test from 'node:test';
import { listOne } from '../src/background/modules/list-unreviewed-products.ts';
import { DEFAULT_BLACKLIST } from '../src/background/store/core.ts';
import type { DraftProduct, WxShopClient } from '../src/background/wxshop/client.ts';
import type { AddLogFn } from '../src/shared/types.ts';

function makeProduct(): DraftProduct {
  return {
    productId: 'product-1',
    title: '测试商品',
    headImgs: [],
    status: 0,
    editStatus: 72,
  };
}

test('store-level freight insurance failure does not delete the draft product', async () => {
  const logs: Parameters<AddLogFn>[0][] = [];
  let deleteCalled = false;
  const api = {
    async getProductDetail() {
      return makeProduct();
    },
    async listProduct() {
      return {
        errcode: 10020110,
        errmsg: '商品信息检查不通过, 错误码:6600144 原因:商家店铺体验分为「差」，需要开通运费险 rid: 6a10262e-6dd42fef-60679933',
      };
    },
    async deleteProduct() {
      deleteCalled = true;
      return { errcode: 0, errmsg: 'ok' };
    },
  } as Partial<WxShopClient> as WxShopClient;

  const result = await listOne(
    api,
    log => logs.push(log),
    makeProduct(),
    'run-1',
    undefined,
    'account-store-level-failure',
    DEFAULT_BLACKLIST,
    true,
    [],
  );

  assert.equal(result, 'stopped');
  assert.equal(deleteCalled, false);
  assert.equal(logs.some(log => log.action === 'delete'), false);
  assert.equal(logs[0]?.errorCode, 10020110);
});
