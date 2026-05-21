import { v4 as uuidv4 } from 'uuid';
import type { Account, Config, FullAccount } from '../../shared/types';
import { DEFAULT_TASK_CONFIG, normalizeAccount, readStore, updateAccountData, writeStore } from './core';

export async function getAccounts(): Promise<Account[]> {
  const store = await readStore();
  return store.accounts.map(normalizeAccount);
}

export async function getAccount(accountId: string): Promise<FullAccount | undefined> {
  const store = await readStore();
  const account = store.accounts.find(a => a.id === accountId);
  return account ? normalizeAccount(account) : undefined;
}

export async function addAccount(name: string, config: Config): Promise<FullAccount> {
  const store = await readStore();
  const account: FullAccount = {
    id: uuidv4(),
    name,
    config,
    taskConfig: DEFAULT_TASK_CONFIG,
    violationWords: [],
    logs: [],
    productSources: [],
    orderAssociations: [],
    realAddressCaches: [],
    createdAt: Date.now(),
  };
  store.accounts.push(account);
  await writeStore({
    accounts: store.accounts,
    activeAccountId: store.activeAccountId || account.id,
  });
  return account;
}

export async function removeAccount(accountId: string): Promise<void> {
  const store = await readStore();
  const accounts = store.accounts.filter(a => a.id !== accountId);
  await writeStore({
    accounts,
    activeAccountId: store.activeAccountId === accountId ? (accounts[0]?.id || '') : store.activeAccountId,
  });
}

export async function updateAccount(accountId: string, patch: Partial<Pick<FullAccount, 'name' | 'config'>>): Promise<void> {
  await updateAccountData(accountId, account => {
    if (patch.name !== undefined) account.name = patch.name;
    if (patch.config !== undefined) account.config = patch.config;
  });
}

export async function getActiveAccountId(): Promise<string> {
  return (await readStore()).activeAccountId;
}

export async function setActiveAccountId(accountId: string): Promise<void> {
  await writeStore({ activeAccountId: accountId });
}

export async function getConfig(accountId: string): Promise<Config> {
  const account = await getAccount(accountId);
  return account?.config || { appId: '', appSecret: '' };
}

export async function setConfig(accountId: string, config: Config): Promise<void> {
  await updateAccount(accountId, { config });
}
