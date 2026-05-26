import { extensionDb } from '../db/extension-db.ts';

export async function markAccountDirty(accountId: string): Promise<void> {
  const account = await extensionDb.accounts.get(accountId);
  if (!account) return;
  const current = await extensionDb.accountSyncStates.get(accountId);
  await extensionDb.accountSyncStates.put({
    accountId,
    appId: account.appId,
    revision: current?.revision || 0,
    checksum: current?.checksum || '',
    dirty: true,
    lastPulledAt: current?.lastPulledAt,
    lastPushedAt: current?.lastPushedAt,
    sessionDeviceId: current?.sessionDeviceId,
    updatedAt: Date.now(),
  });
}

export async function markAccountSynced(
  accountId: string,
  revision: number,
  checksum: string,
  timestamp = Date.now(),
): Promise<void> {
  const account = await extensionDb.accounts.get(accountId);
  if (!account) return;
  const current = await extensionDb.accountSyncStates.get(accountId);
  await extensionDb.accountSyncStates.put({
    accountId,
    appId: account.appId,
    revision,
    checksum,
    dirty: false,
    lastPulledAt: current?.lastPulledAt,
    lastPushedAt: timestamp,
    sessionDeviceId: current?.sessionDeviceId,
    updatedAt: timestamp,
  });
}
