import type { StoreSchema } from './core';
import { CURRENT_STORAGE_VERSION } from './core';
import { DEFAULT_NOTIFICATION_PREFERENCE } from '../../shared/notification';
import { DEFAULT_APP_SETTINGS } from '../../shared/settings';

type RawStore = Partial<StoreSchema> & Record<string, unknown>;
type Migration = (store: RawStore) => RawStore;

const migrations: Record<number, Migration> = {
  1(store) {
    return {
      ...store,
      accounts: Array.isArray(store.accounts) ? store.accounts : [],
      activeAccountId: typeof store.activeAccountId === 'string' ? store.activeAccountId : '',
      scheduledJobs: Array.isArray(store.scheduledJobs) ? store.scheduledJobs : [],
      skipKeywords: Array.isArray(store.skipKeywords) ? store.skipKeywords : [],
      storageVersion: 1,
    };
  },
  2(store) {
    return {
      ...store,
      notificationPreference: store.notificationPreference || DEFAULT_NOTIFICATION_PREFERENCE,
      storageVersion: 2,
    };
  },
  3(store) {
    return {
      ...store,
      scheduledJobs: Array.isArray(store.scheduledJobs) ? store.scheduledJobs : [],
      storageVersion: 3,
    };
  },
  4(store) {
    return {
      ...store,
      wxAccessTokens: typeof store.wxAccessTokens === 'object' && store.wxAccessTokens !== null ? store.wxAccessTokens : {},
      storageVersion: 4,
    };
  },
  5(store) {
    const accounts = Array.isArray(store.accounts)
      ? store.accounts.map(account => {
        if (!account || typeof account !== 'object') return account;
        const next = {
          ...account,
          listingLogs: [],
          violationLogs: [],
        } as Record<string, unknown>;
        delete next.logs;
        return next;
      })
      : [];
    return {
      ...store,
      accounts: accounts as unknown as StoreSchema['accounts'],
      notificationPreference: DEFAULT_NOTIFICATION_PREFERENCE,
      storageVersion: 5,
    };
  },
  6(store) {
    return {
      ...store,
      appSettings: store.appSettings || DEFAULT_APP_SETTINGS,
      storageVersion: 6,
    };
  },
  7(store) {
    return {
      ...store,
      scheduledJobs: [],
      storageVersion: 7,
    };
  },
};

export async function migrateStore(): Promise<void> {
  const store = await chrome.storage.local.get(null) as RawStore;
  let version = typeof store.storageVersion === 'number' ? store.storageVersion : 0;
  if (version > CURRENT_STORAGE_VERSION) return;

  let nextStore = store;
  while (version < CURRENT_STORAGE_VERSION) {
    const nextVersion = version + 1;
    const migration = migrations[nextVersion];
    if (!migration) throw new Error(`Missing storage migration: ${nextVersion}`);
    nextStore = migration(nextStore);
    version = nextVersion;
  }

  await chrome.storage.local.set(nextStore);
}
