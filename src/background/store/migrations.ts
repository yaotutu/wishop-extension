import type { StoreSchema } from './core';
import { CURRENT_STORAGE_VERSION } from './core';
import { DEFAULT_NOTIFICATION_PREFERENCE, normalizeNotificationPreference } from '../../shared/notification';
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from '../../shared/settings';
import { extensionDb } from '../db/extension-db.ts';

type RawStore = Partial<StoreSchema> & Record<string, unknown>;
type Migration = (store: RawStore) => RawStore;

const migrations: Record<number, Migration> = {
  1(store) {
    return {
      ...store,
      accounts: Array.isArray(store.accounts) ? store.accounts : [],
      activeAccountId: typeof store.activeAccountId === 'string' ? store.activeAccountId : '',
      scheduledJobs: Array.isArray(store.scheduledJobs) ? store.scheduledJobs : [],
      productAuditRules: [],
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
  8(store) {
    return {
      ...store,
      activityLogs: [],
      notifications: [],
      notificationPreference: DEFAULT_NOTIFICATION_PREFERENCE,
      storageVersion: 8,
    };
  },
  9(store) {
    return {
      ...store,
      storageVersion: 9,
    };
  },
  10(store) {
    return {
      ...store,
      storageVersion: 10,
    };
  },
  11(store) {
    return {
      ...store,
      storageVersion: 11,
    };
  },
  12(store) {
    const appSettings = store.appSettings && typeof store.appSettings === 'object'
      ? store.appSettings as unknown as Record<string, unknown>
      : {};
    // 本版本正式使用“复制商品”业务域，只搬迁设置开关，不迁移历史采集商品记录。
    const normalizedAppSettings = { ...appSettings };
    normalizedAppSettings.aiProductCopy = appSettings.aiProductCopy || appSettings.aiListing;
    delete normalizedAppSettings.aiListing;
    const notificationPreference = store.notificationPreference && typeof store.notificationPreference === 'object'
      ? store.notificationPreference as unknown as Record<string, unknown>
      : {};
    const domainEnabled = notificationPreference.domainEnabled && typeof notificationPreference.domainEnabled === 'object'
      ? { ...notificationPreference.domainEnabled as Record<string, unknown> }
      : {};
    const legacyListingEnabled = typeof domainEnabled.listing === 'boolean' ? domainEnabled.listing : undefined;
    delete domainEnabled.listing;
    return {
      ...store,
      appSettings: normalizeAppSettings(normalizedAppSettings),
      notificationPreference: normalizeNotificationPreference({
        ...notificationPreference,
        domainEnabled: {
          ...domainEnabled,
          productCopy: typeof domainEnabled.productCopy === 'boolean'
            ? domainEnabled.productCopy
            : legacyListingEnabled ?? DEFAULT_NOTIFICATION_PREFERENCE.domainEnabled.productCopy,
        },
      }),
      storageVersion: 12,
    };
  },
  13(store) {
    return {
      ...store,
      storageVersion: 13,
    };
  },
  14(store) {
    return {
      ...store,
      storageVersion: 14,
    };
  },
};

const LEGACY_BUSINESS_KEYS = [
  'accounts',
  'scheduledJobs',
  'skipKeywords',
  'blacklistRules',
  'productAuditRules',
  'statusRules',
  'notificationPreference',
  'appSettings',
  'activityLogs',
  'notifications',
  'orderSnapshots',
  'orderSyncStates',
];

function legacyCacheKeys(store: RawStore): string[] {
  return Object.keys(store).filter(key => key.startsWith('ordersListCache:'));
}

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
  const localStorage = chrome.storage.local as typeof chrome.storage.local & {
    remove(keys: string | string[]): Promise<void>;
  };
  await localStorage.remove([...LEGACY_BUSINESS_KEYS, ...legacyCacheKeys(store)]);
  if ((typeof store.storageVersion === 'number' ? store.storageVersion : 0) < 12) {
    await extensionDb.productCopyRecords.clear();
  }
  await chrome.storage.local.set({ storageVersion: CURRENT_STORAGE_VERSION });
}
