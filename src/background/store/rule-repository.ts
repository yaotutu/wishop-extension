import type { BlacklistRule, StatusRule } from '../../shared/types';
import { DEFAULT_BLACKLIST, DEFAULT_STATUS_RULES, readStore, updateAccountData, writeStore } from './core';
import { getAccount } from './account-repository';

export async function getViolationWords(accountId: string): Promise<string[]> {
  return (await getAccount(accountId))?.violationWords || [];
}

export async function setViolationWords(accountId: string, words: string[]): Promise<void> {
  await updateAccountData(accountId, account => {
    account.violationWords = words;
  });
}

export function getDefaultBlacklistCodes(): number[] {
  return DEFAULT_BLACKLIST.map(rule => rule.code);
}

export async function getBlacklistRules(): Promise<BlacklistRule[]> {
  const stored = (await readStore()).blacklistRules;
  if (!stored) return DEFAULT_BLACKLIST;
  const codeSet = new Set(stored.map(rule => rule.code));
  return [...stored, ...DEFAULT_BLACKLIST.filter(rule => !codeSet.has(rule.code))];
}

export async function setBlacklistRules(rules: BlacklistRule[]): Promise<void> {
  const defaultCodes = new Set(DEFAULT_BLACKLIST.map(rule => rule.code));
  await writeStore({ blacklistRules: rules.filter(rule => !defaultCodes.has(rule.code)) });
}

export async function getSkipKeywords(): Promise<string[]> {
  return (await readStore()).skipKeywords || [];
}

export async function setSkipKeywords(keywords: string[]): Promise<void> {
  await writeStore({ skipKeywords: keywords });
}

export async function getStatusRules(): Promise<StatusRule[]> {
  const stored = (await readStore()).statusRules;
  if (!stored) return DEFAULT_STATUS_RULES;
  const statusSet = new Set(stored.map(rule => rule.editStatus));
  return [...stored, ...DEFAULT_STATUS_RULES.filter(rule => !statusSet.has(rule.editStatus))];
}

export async function setStatusRules(rules: StatusRule[]): Promise<void> {
  await writeStore({ statusRules: rules });
}

export function getDefaultStatusRules(): StatusRule[] {
  return DEFAULT_STATUS_RULES;
}
