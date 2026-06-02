import assert from 'node:assert/strict';
import test from 'node:test';
import { runProductAuditCycle } from '../src/background/modules/product-audit-cycle.ts';
import type {
  AddLogFn,
  DraftProduct,
  ProductAuditFailureRule,
  ProductAuditTaskConfig,
  StatusRule,
} from '../src/shared/types.ts';
import type { WxShopListingClient } from '../src/background/wxshop/listing/types.ts';

const keepFreightInsuranceRule: ProductAuditFailureRule = {
  id: 'keep-6600144',
  enabled: true,
  action: 'keepDraft',
  match: { type: 'embeddedErrorCode', code: 6600144 },
  description: '需要开通运费险，保留草稿待人工处理',
};

const config: ProductAuditTaskConfig = {
  submitUnauditedDrafts: true,
  submitLimit: 2,
  defaultFailureAction: 'deleteDraft',
};

const statusRules: StatusRule[] = [
  { editStatus: 72, label: '未审核', action: 'submit' },
];

function makeDraft(productId: string, title: string): DraftProduct {
  return {
    productId,
    title,
    headImgs: [],
    status: 0,
    editStatus: 72,
  };
}

test('runProductAuditCycle keeps one failed draft and continues submitting the next draft', async () => {
  const logs: Parameters<AddLogFn>[0][] = [];
  const submitCalls: string[] = [];
  const drafts = [
    makeDraft('draft-1', '需要人工处理的草稿'),
    makeDraft('draft-2', '可提审草稿'),
  ];
  const api = {
    async getDraftProducts() {
      return {
        productIds: drafts.map(draft => draft.productId),
        nextKey: '',
        hasMore: false,
      };
    },
    async getProductDetail(productId: string) {
      return drafts.find(draft => draft.productId === productId)!;
    },
    async submitProductAudit(productId: string) {
      submitCalls.push(productId);
      if (productId === 'draft-1') {
        return {
          errcode: 10020110,
          errmsg: '商品信息检查不通过, 错误码:6600144 原因:需要开通运费险',
        };
      }
      return { errcode: 0, errmsg: 'ok' };
    },
    async deleteProduct() {
      throw new Error('不应该删除草稿');
    },
  } as Partial<WxShopListingClient> as WxShopListingClient;

  const result = await runProductAuditCycle({
    api,
    addLog: log => logs.push(log),
    config,
    runId: 'run-1',
    accountId: 'cycle-account-1',
    failureRules: [keepFreightInsuranceRule],
    statusRules,
  });

  assert.deepEqual(submitCalls, ['draft-1', 'draft-2']);
  assert.equal(result.submitted, 1);
  assert.equal(result.kept, 1);
  assert.equal(result.deleted, 0);
  assert.equal(result.stopped, false);
  assert.equal(logs.some(log => log.action === 'keepDraft'), true);
});

