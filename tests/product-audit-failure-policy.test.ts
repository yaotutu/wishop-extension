import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decideProductAuditFailure,
  extractProductAuditErrorCodes,
} from '../src/background/modules/product-audit-failure-policy.ts';
import type { ProductAuditFailureRule } from '../src/shared/types.ts';

const stopQuotaRule: ProductAuditFailureRule = {
  id: 'stop-quota',
  enabled: true,
  action: 'stopTask',
  match: { type: 'outerErrorCode', code: 6600148 },
  description: '今日提审次数已用尽',
};

const keepFreightInsuranceRule: ProductAuditFailureRule = {
  id: 'keep-freight-insurance',
  enabled: true,
  action: 'keepDraft',
  match: { type: 'embeddedErrorCode', code: 6600144 },
  description: '需要开通运费险，保留草稿待人工处理',
};

const deleteInvalidCategoryRule: ProductAuditFailureRule = {
  id: 'delete-invalid-category',
  enabled: true,
  action: 'deleteDraft',
  match: { type: 'keyword', keyword: '类目不可用' },
  description: '类目不可用的草稿自动删除',
};

test('extractProductAuditErrorCodes returns the outer error code and all embedded error codes', () => {
  const parsed = extractProductAuditErrorCodes({
    errcode: 10020110,
    errmsg: '商品信息检查不通过, 错误码:6600144 原因:需要开通运费险, 错误码:123456',
  });

  assert.equal(parsed.outerErrorCode, 10020110);
  assert.deepEqual(parsed.embeddedErrorCodes, [6600144, 123456]);
});

test('decideProductAuditFailure stops the whole task when a stop rule matches', () => {
  const decision = decideProductAuditFailure({
    errcode: 6600148,
    errmsg: '今日提审次数已用尽',
    rules: [deleteInvalidCategoryRule, keepFreightInsuranceRule, stopQuotaRule],
    defaultAction: 'keepDraft',
  });

  assert.equal(decision.action, 'stopTask');
  assert.equal(decision.matchedRule?.id, 'stop-quota');
});

test('decideProductAuditFailure keeps the draft when keep and delete rules both match', () => {
  const decision = decideProductAuditFailure({
    errcode: 10020110,
    errmsg: '商品信息检查不通过, 错误码:6600144 原因:需要开通运费险，同时类目不可用',
    rules: [deleteInvalidCategoryRule, keepFreightInsuranceRule],
    defaultAction: 'deleteDraft',
  });

  assert.equal(decision.action, 'keepDraft');
  assert.equal(decision.matchedRule?.id, 'keep-freight-insurance');
});

test('decideProductAuditFailure keeps 6600144 draft by default instead of stopping or deleting', () => {
  const decision = decideProductAuditFailure({
    errcode: 10020110,
    errmsg: '商品信息检查不通过, 错误码:6600144 原因:商家退货退款率位于类目头部10%，需要开通运费险',
    rules: [stopQuotaRule, keepFreightInsuranceRule],
    defaultAction: 'deleteDraft',
  });

  assert.equal(decision.action, 'keepDraft');
  assert.equal(decision.matchedRule?.action, 'keepDraft');
});

test('decideProductAuditFailure uses the configured default action when no rule matches', () => {
  const keepDecision = decideProductAuditFailure({
    errcode: 10020110,
    errmsg: '商品信息检查不通过，缺少商品图片',
    rules: [stopQuotaRule, keepFreightInsuranceRule],
    defaultAction: 'keepDraft',
  });
  const deleteDecision = decideProductAuditFailure({
    errcode: 10020110,
    errmsg: '商品信息检查不通过，缺少商品图片',
    rules: [stopQuotaRule, keepFreightInsuranceRule],
    defaultAction: 'deleteDraft',
  });

  assert.equal(keepDecision.action, 'keepDraft');
  assert.equal(keepDecision.reason, '未命中失败处理规则，按默认动作保留草稿');
  assert.equal(deleteDecision.action, 'deleteDraft');
  assert.equal(deleteDecision.reason, '未命中失败处理规则，按默认动作删除草稿');
});

