import type { ProductAuditFailureRule, StatusRule } from '../../shared/types';
import { DEFAULT_PRODUCT_AUDIT_FAILURE_RULES, DEFAULT_STATUS_RULES } from './core.ts';
import {
  ensureAccountWorkspace,
  mergeStatusRules,
  updateAccountWorkspace,
} from './workspace-repository.ts';

const GLOBAL_RULE_WORKSPACE_ID = '__global_rules__';

export async function getViolationWords(accountId: string): Promise<string[]> {
  return (await ensureAccountWorkspace(accountId)).rules.violationWords;
}

export async function setViolationWords(accountId: string, words: string[]): Promise<void> {
  await updateAccountWorkspace(accountId, workspace => {
    workspace.rules.violationWords = words;
  });
}

export function getDefaultProductAuditFailureRules(): ProductAuditFailureRule[] {
  return DEFAULT_PRODUCT_AUDIT_FAILURE_RULES;
}

export async function getProductAuditFailureRules(): Promise<ProductAuditFailureRule[]> {
  return (await ensureAccountWorkspace(GLOBAL_RULE_WORKSPACE_ID)).rules.productAuditRules;
}

export async function setProductAuditFailureRules(rules: ProductAuditFailureRule[]): Promise<void> {
  await updateAccountWorkspace(GLOBAL_RULE_WORKSPACE_ID, workspace => {
    workspace.rules.productAuditRules = rules;
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
