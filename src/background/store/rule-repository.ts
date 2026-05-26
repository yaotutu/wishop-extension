import type { BlacklistRule, StatusRule } from '../../shared/types';
import { DEFAULT_BLACKLIST, DEFAULT_STATUS_RULES } from './core.ts';
import {
  ensureAccountWorkspace,
  mergeBlacklistRules,
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

export function getDefaultBlacklistCodes(): number[] {
  return DEFAULT_BLACKLIST.map(rule => rule.code);
}

export async function getBlacklistRules(): Promise<BlacklistRule[]> {
  const stored = (await ensureAccountWorkspace(GLOBAL_RULE_WORKSPACE_ID)).rules.blacklistRules;
  return stored.length > 0 ? mergeBlacklistRules(stored) : DEFAULT_BLACKLIST;
}

export async function setBlacklistRules(rules: BlacklistRule[]): Promise<void> {
  const defaultCodes = new Set(DEFAULT_BLACKLIST.map(rule => rule.code));
  await updateAccountWorkspace(GLOBAL_RULE_WORKSPACE_ID, workspace => {
    workspace.rules.blacklistRules = rules.filter(rule => !defaultCodes.has(rule.code));
  });
}

export async function getSkipKeywords(): Promise<string[]> {
  return (await ensureAccountWorkspace(GLOBAL_RULE_WORKSPACE_ID)).rules.skipKeywords;
}

export async function setSkipKeywords(keywords: string[]): Promise<void> {
  await updateAccountWorkspace(GLOBAL_RULE_WORKSPACE_ID, workspace => {
    workspace.rules.skipKeywords = keywords;
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
