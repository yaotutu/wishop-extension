import { v4 as uuidv4 } from 'uuid';
import type { Account, Config, FullAccount } from '../../shared/types';
import { extensionDb, type AccountRecord } from '../db/extension-db.ts';
import { DEFAULT_TASK_CONFIG } from './core.ts';
import { ensureAccountWorkspace } from './workspace-repository.ts';

const ACTIVE_ACCOUNT_ID_KEY = 'activeAccountId';

function toAccount(record: AccountRecord): Account {
  return {
    id: record.id,
    name: record.name,
    config: record.config,
    createdAt: record.createdAt,
  };
}

async function getActiveAccountIdFromStorage(): Promise<string> {
  if (!globalThis.chrome?.storage?.local) return '';
  const data = await chrome.storage.local.get(ACTIVE_ACCOUNT_ID_KEY);
  return typeof data[ACTIVE_ACCOUNT_ID_KEY] === 'string' ? data[ACTIVE_ACCOUNT_ID_KEY] : '';
}

async function setActiveAccountIdInStorage(accountId: string): Promise<void> {
  if (!globalThis.chrome?.storage?.local) return;
  await chrome.storage.local.set({ [ACTIVE_ACCOUNT_ID_KEY]: accountId });
}

export async function getAccounts(): Promise<Account[]> {
  const accounts = await extensionDb.accounts.toArray();
  return accounts.map(toAccount);
}

export async function getAccount(accountId: string): Promise<FullAccount | undefined> {
  const account = await extensionDb.accounts.get(accountId);
  if (!account) return undefined;
  const workspace = await ensureAccountWorkspace(accountId);
  return {
    ...toAccount(account),
    taskConfig: workspace.taskConfig,
    violationWords: workspace.rules.violationWords,
    listingLogs: [],
    violationLogs: [],
    productSources: workspace.productSources,
    orderAssociations: workspace.orderAssociations,
    realAddressCaches: workspace.realAddressCaches,
  };
}

export async function addAccount(name: string, config: Config): Promise<FullAccount> {
  const timestamp = Date.now();
  const account: FullAccount = {
    id: uuidv4(),
    name,
    config,
    taskConfig: DEFAULT_TASK_CONFIG,
    violationWords: [],
    listingLogs: [],
    violationLogs: [],
    productSources: [],
    orderAssociations: [],
    realAddressCaches: [],
    createdAt: timestamp,
  };
  await extensionDb.transaction('rw', extensionDb.accounts, extensionDb.accountWorkspaces, async () => {
    await extensionDb.accounts.put({
      id: account.id,
      appId: config.appId,
      name,
      config,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await ensureAccountWorkspace(account.id);
  });
  if (!(await getActiveAccountId())) await setActiveAccountId(account.id);
  return account;
}

export async function removeAccount(accountId: string): Promise<void> {
  await extensionDb.transaction(
    'rw',
    [
      extensionDb.accounts,
      extensionDb.accountWorkspaces,
      extensionDb.orders,
      extensionDb.accountLogs,
      extensionDb.accountSyncStates,
    ],
    async () => {
      await extensionDb.accounts.delete(accountId);
      await extensionDb.accountWorkspaces.delete(accountId);
      await extensionDb.orders.where('accountId').equals(accountId).delete();
      await extensionDb.accountLogs.where('accountId').equals(accountId).delete();
      await extensionDb.accountSyncStates.delete(accountId);
    },
  );
  if ((await getActiveAccountId()) === accountId) {
    const first = (await getAccounts())[0]?.id || '';
    await setActiveAccountId(first);
  }
}

export async function updateAccount(accountId: string, patch: Partial<Pick<FullAccount, 'name' | 'config'>>): Promise<void> {
  const account = await extensionDb.accounts.get(accountId);
  if (!account) return;
  await extensionDb.accounts.put({
    ...account,
    name: patch.name ?? account.name,
    config: patch.config ?? account.config,
    appId: patch.config?.appId ?? account.appId,
    updatedAt: Date.now(),
  });
}

export async function getActiveAccountId(): Promise<string> {
  return getActiveAccountIdFromStorage();
}

export async function setActiveAccountId(accountId: string): Promise<void> {
  await setActiveAccountIdInStorage(accountId);
}

export async function getConfig(accountId: string): Promise<Config> {
  const account = await getAccount(accountId);
  return account?.config || { appId: '', appSecret: '' };
}

export async function setConfig(accountId: string, config: Config): Promise<void> {
  await updateAccount(accountId, { config });
}
