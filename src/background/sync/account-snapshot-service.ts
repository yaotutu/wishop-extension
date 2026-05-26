import { extensionDb, type AccountLogRecord, type AccountSyncStateRecord, type AccountWorkspaceRecord, type OrderRecord } from '../db/extension-db.ts';
import type { AccountRecord } from '../db/extension-db.ts';

export const ACCOUNT_SNAPSHOT_VERSION = 1;

export interface AccountSnapshot {
  snapshotVersion: number;
  appId: string;
  accountId: string;
  exportedAt: number;
  tables: {
    account: AccountRecord;
    orders: OrderRecord[];
    workspace: AccountWorkspaceRecord;
    logs: AccountLogRecord[];
    syncState: AccountSyncStateRecord | null;
  };
}

export async function exportAccountSnapshot(accountId: string): Promise<AccountSnapshot> {
  const [account, orders, workspace, logs, syncState] = await Promise.all([
    extensionDb.accounts.get(accountId),
    extensionDb.orders.where('accountId').equals(accountId).toArray(),
    extensionDb.accountWorkspaces.get(accountId),
    extensionDb.accountLogs.where('accountId').equals(accountId).toArray(),
    extensionDb.accountSyncStates.get(accountId),
  ]);

  if (!account) throw new Error(`账号不存在，无法导出快照: ${accountId}`);
  if (!workspace) throw new Error(`账号工作区不存在，无法导出快照: ${accountId}`);

  return {
    snapshotVersion: ACCOUNT_SNAPSHOT_VERSION,
    appId: account.appId,
    accountId,
    exportedAt: Date.now(),
    tables: {
      account,
      orders,
      workspace,
      logs,
      syncState: syncState || null,
    },
  };
}

export async function importAccountSnapshot(snapshot: AccountSnapshot): Promise<void> {
  if (snapshot.snapshotVersion !== ACCOUNT_SNAPSHOT_VERSION) {
    throw new Error(`不支持的账号快照版本: ${snapshot.snapshotVersion}`);
  }
  const { accountId } = snapshot;
  if (snapshot.tables.account.id !== accountId) {
    throw new Error(`账号快照不匹配: ${accountId}`);
  }
  if (snapshot.tables.workspace.accountId !== accountId) {
    throw new Error(`账号工作区快照不匹配: ${accountId}`);
  }
  if (snapshot.tables.orders.some(order => order.accountId !== accountId)) {
    throw new Error(`订单快照包含其它账号数据: ${accountId}`);
  }
  if (snapshot.tables.logs.some(log => log.accountId !== accountId)) {
    throw new Error(`日志快照包含其它账号数据: ${accountId}`);
  }
  if (snapshot.tables.syncState && snapshot.tables.syncState.accountId !== accountId) {
    throw new Error(`同步状态快照不匹配: ${accountId}`);
  }

  await extensionDb.transaction(
    'rw',
    [
      extensionDb.accounts,
      extensionDb.orders,
      extensionDb.accountWorkspaces,
      extensionDb.accountLogs,
      extensionDb.accountSyncStates,
    ],
    async () => {
      await extensionDb.orders.where('accountId').equals(accountId).delete();
      await extensionDb.accountLogs.where('accountId').equals(accountId).delete();
      await extensionDb.accounts.put(snapshot.tables.account);
      await extensionDb.accountWorkspaces.put(snapshot.tables.workspace);
      if (snapshot.tables.orders.length > 0) {
        await extensionDb.orders.bulkPut(snapshot.tables.orders);
      }
      if (snapshot.tables.logs.length > 0) {
        await extensionDb.accountLogs.bulkPut(snapshot.tables.logs);
      }
      if (snapshot.tables.syncState) {
        await extensionDb.accountSyncStates.put(snapshot.tables.syncState);
      } else {
        await extensionDb.accountSyncStates.delete(accountId);
      }
    },
  );
}
