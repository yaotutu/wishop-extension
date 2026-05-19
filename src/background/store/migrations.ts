import type { StoreSchema } from './core';
import { CURRENT_STORAGE_VERSION } from './core';

type RawStore = Partial<StoreSchema> & Record<string, unknown>;
type Migration = (store: RawStore) => RawStore;

const migrations: Record<number, Migration> = {
  1(store) {
    return {
      ...store,
      accounts: Array.isArray(store.accounts) ? store.accounts : [],
      activeAccountId: typeof store.activeAccountId === 'string' ? store.activeAccountId : '',
      globalSchedulers: Array.isArray(store.globalSchedulers) ? store.globalSchedulers : [],
      skipKeywords: Array.isArray(store.skipKeywords) ? store.skipKeywords : [],
      storageVersion: 1,
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
