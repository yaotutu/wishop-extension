import assert from 'node:assert/strict';
import test from 'node:test';
import { precheckCategoryForProductAudit } from '../src/background/services/product-audit-precheck-service.ts';
import type { WxShopListingClient } from '../src/background/wxshop/listing/types.ts';

function makeClient(result: { allPass: boolean; failReasons: string[] }): WxShopListingClient {
  return {
    async precheckProductCategory(catId: string) {
      assert.equal(catId, '6091');
      return { catId, ...result };
    },
  } as Partial<WxShopListingClient> as WxShopListingClient;
}

test('product audit category precheck returns pass result without submitting a draft', async () => {
  const result = await precheckCategoryForProductAudit({
    accountId: 'account-1',
    catId: '6091',
  }, {
    getClient: async () => makeClient({ allPass: true, failReasons: [] }),
  });

  assert.equal(result.accountId, 'account-1');
  assert.equal(result.catId, '6091');
  assert.equal(result.allPass, true);
  assert.deepEqual(result.failReasons, []);
  assert.equal(typeof result.checkedAt, 'number');
});

test('product audit category precheck keeps failed gate reasons in the product audit domain', async () => {
  const result = await precheckCategoryForProductAudit({
    accountId: 'account-1',
    catId: '6091',
  }, {
    getClient: async () => makeClient({
      allPass: false,
      failReasons: ['商家店铺体验分为「差」，需要开通运费险'],
    }),
  });

  assert.equal(result.allPass, false);
  assert.deepEqual(result.failReasons, ['商家店铺体验分为「差」，需要开通运费险']);
});
