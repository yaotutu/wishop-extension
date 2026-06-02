import assert from 'node:assert/strict';
import test from 'node:test';
import { submitDraftForAudit } from '../src/background/modules/submit-draft-for-audit.ts';
import type { DraftProduct, ProductAuditFailureRule, AddLogFn } from '../src/shared/types.ts';
import type { WxShopListingClient } from '../src/background/wxshop/listing/types.ts';

function makeProduct(): DraftProduct {
  return {
    productId: 'draft-1',
    title: '测试草稿',
    headImgs: [],
    status: 0,
    editStatus: 72,
  };
}

function makeClient(result: { errcode: number; errmsg: string }): WxShopListingClient {
  return {
    async getProductDetail() {
      return makeProduct();
    },
    async submitProductAudit(productId: string) {
      assert.equal(productId, 'draft-1');
      return result;
    },
    async deleteProduct() {
      return { errcode: 0, errmsg: 'ok' };
    },
  } as Partial<WxShopListingClient> as WxShopListingClient;
}

test('submitDraftForAudit records success without entering the failure policy', async () => {
  const logs: Parameters<AddLogFn>[0][] = [];

  const result = await submitDraftForAudit({
    api: makeClient({ errcode: 0, errmsg: 'ok' }),
    addLog: log => logs.push(log),
    product: makeProduct(),
    runId: 'run-1',
    accountId: 'account-1',
    failureRules: [{
      id: 'stop-if-keyword',
      enabled: true,
      action: 'stopTask',
      match: { type: 'keyword', keyword: 'ok' },
    }],
    defaultFailureAction: 'deleteDraft',
  });

  assert.equal(result.action, 'success');
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.action, 'submitAudit');
  assert.equal(logs[0]?.status, 'success');
  assert.equal(logs[0]?.decisionAction, undefined);
});

test('submitDraftForAudit keeps 6600144 draft and does not delete it', async () => {
  const logs: Parameters<AddLogFn>[0][] = [];
  let deleteCalled = false;
  const keepRule: ProductAuditFailureRule = {
    id: 'keep-6600144',
    enabled: true,
    action: 'keepDraft',
    match: { type: 'embeddedErrorCode', code: 6600144 },
    description: '需要开通运费险，保留草稿待人工处理',
  };
  const api = {
    async getProductDetail() {
      return makeProduct();
    },
    async submitProductAudit() {
      return {
        errcode: 10020110,
        errmsg: '商品信息检查不通过, 错误码:6600144 原因:商家退货退款率位于类目头部10%，需要开通运费险',
      };
    },
    async deleteProduct() {
      deleteCalled = true;
      return { errcode: 0, errmsg: 'ok' };
    },
  } as Partial<WxShopListingClient> as WxShopListingClient;

  const result = await submitDraftForAudit({
    api,
    addLog: log => logs.push(log),
    product: makeProduct(),
    runId: 'run-1',
    accountId: 'account-1',
    failureRules: [keepRule],
    defaultFailureAction: 'deleteDraft',
  });

  assert.equal(result.action, 'keepDraft');
  assert.equal(deleteCalled, false);
  assert.equal(logs.length, 2);
  assert.equal(logs[0]?.action, 'submitAudit');
  assert.equal(logs[1]?.action, 'keepDraft');
  assert.equal(logs[1]?.decisionAction, 'keepDraft');
  assert.equal(logs[1]?.matchedRuleId, 'keep-6600144');
});
