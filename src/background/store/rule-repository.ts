import type { ProductAuditFailurePolicy, StatusRule } from '../../shared/types';
import {
  DEFAULT_PRODUCT_AUDIT_FAILURE_DEFAULT_ACTION,
  DEFAULT_PRODUCT_AUDIT_FAILURE_RULES,
  DEFAULT_STATUS_RULES,
} from './core.ts';
import {
  ensureAccountWorkspace,
  mergeStatusRules,
  updateAccountWorkspace,
} from './workspace-repository.ts';

const GLOBAL_RULE_WORKSPACE_ID = '__global_rules__';

function normalizeProductAuditFailurePolicy(policy: ProductAuditFailurePolicy): ProductAuditFailurePolicy {
  return {
    rules: policy.rules.filter(rule => rule.action !== 'deleteDraft'),
    defaultAction: DEFAULT_PRODUCT_AUDIT_FAILURE_DEFAULT_ACTION,
  };
}

export function getDefaultProductAuditFailurePolicy(): ProductAuditFailurePolicy {
  return normalizeProductAuditFailurePolicy({
    rules: DEFAULT_PRODUCT_AUDIT_FAILURE_RULES,
    defaultAction: DEFAULT_PRODUCT_AUDIT_FAILURE_DEFAULT_ACTION,
  });
}

export async function getProductAuditFailurePolicy(): Promise<ProductAuditFailurePolicy> {
  const rules = (await ensureAccountWorkspace(GLOBAL_RULE_WORKSPACE_ID)).rules;
  return normalizeProductAuditFailurePolicy({
    rules: rules.productAuditRules,
    defaultAction: rules.productAuditDefaultFailureAction,
  });
}

export async function setProductAuditFailurePolicy(policy: ProductAuditFailurePolicy): Promise<void> {
  const normalizedPolicy = normalizeProductAuditFailurePolicy(policy);
  await updateAccountWorkspace(GLOBAL_RULE_WORKSPACE_ID, workspace => {
    workspace.rules.productAuditRules = normalizedPolicy.rules;
    workspace.rules.productAuditDefaultFailureAction = normalizedPolicy.defaultAction;
  });
}

export async function getStatusRules(): Promise<StatusRule[]> {
  const stored = (await ensureAccountWorkspace(GLOBAL_RULE_WORKSPACE_ID)).rules.statusRules;
  return stored.length > 0 ? mergeStatusRules(stored) : DEFAULT_STATUS_RULES;
}

export async function setStatusRules(rules: StatusRule[]): Promise<void> {
  await updateAccountWorkspace(GLOBAL_RULE_WORKSPACE_ID, workspace => {
    workspace.rules.statusRules = rules;
  });
}

export function getDefaultStatusRules(): StatusRule[] {
  return DEFAULT_STATUS_RULES;
}
