import type {
  ProductAuditFailureAction,
  ProductAuditFailureDecision,
  ProductAuditFailureDefaultAction,
  ProductAuditFailureRule,
} from '../../shared/types';

const ACTION_RANK: Record<ProductAuditFailureAction, number> = {
  stopTask: 0,
  keepDraft: 1,
  deleteDraft: 2,
};

export interface ProductAuditFailureInput {
  errcode: number;
  errmsg?: string;
}

export interface ProductAuditFailureDecisionInput extends ProductAuditFailureInput {
  rules: ProductAuditFailureRule[];
  defaultAction: ProductAuditFailureDefaultAction;
}

export interface ProductAuditParsedErrorCodes {
  outerErrorCode: number;
  embeddedErrorCodes: number[];
}

export function extractProductAuditErrorCodes(input: ProductAuditFailureInput): ProductAuditParsedErrorCodes {
  const embeddedErrorCodes: number[] = [];
  const matches = input.errmsg?.matchAll(/错误码[:：]\s*(\d+)/g) ?? [];

  for (const match of matches) {
    const code = Number(match[1]);
    if (Number.isFinite(code) && !embeddedErrorCodes.includes(code)) {
      embeddedErrorCodes.push(code);
    }
  }

  return {
    outerErrorCode: input.errcode,
    embeddedErrorCodes,
  };
}

function ruleMatches(rule: ProductAuditFailureRule, input: ProductAuditFailureInput, parsed: ProductAuditParsedErrorCodes): boolean {
  if (!rule.enabled) return false;

  if (rule.match.type === 'outerErrorCode') {
    return rule.match.code === parsed.outerErrorCode;
  }

  if (rule.match.type === 'embeddedErrorCode') {
    return parsed.embeddedErrorCodes.includes(rule.match.code);
  }

  return Boolean(rule.match.keyword && input.errmsg?.includes(rule.match.keyword));
}

function sortMatchedRules(a: ProductAuditFailureRule, b: ProductAuditFailureRule): number {
  const actionDiff = ACTION_RANK[a.action] - ACTION_RANK[b.action];
  if (actionDiff !== 0) return actionDiff;
  return (a.priority ?? 100) - (b.priority ?? 100);
}

function defaultReason(action: ProductAuditFailureDefaultAction): string {
  return action === 'deleteDraft'
    ? '未命中失败处理规则，按默认动作删除草稿'
    : '未命中失败处理规则，按默认动作保留草稿';
}

export function decideProductAuditFailure(input: ProductAuditFailureDecisionInput): ProductAuditFailureDecision {
  const parsed = extractProductAuditErrorCodes(input);
  const matchedRule = input.rules
    .filter(rule => ruleMatches(rule, input, parsed))
    .sort(sortMatchedRules)[0];

  if (matchedRule) {
    return {
      action: matchedRule.action,
      reason: matchedRule.description || `命中失败处理规则 ${matchedRule.id}`,
      matchedRule,
      ...parsed,
    };
  }

  return {
    action: input.defaultAction,
    reason: defaultReason(input.defaultAction),
    ...parsed,
  };
}

