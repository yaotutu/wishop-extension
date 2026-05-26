import Dexie, { type Table } from 'dexie';
import type { NotificationPreference } from '../../shared/notification';
import type { AppSettings } from '../../shared/settings';
import type {
  BlacklistRule,
  Config,
  Order,
  OrderAssociation,
  OrderRealAddressCache,
  OrderSyncAccountState,
  ProductSourceBinding,
  ScheduledJob,
  StatusRule,
  StoredOrderSource,
  TaskConfig,
} from '../../shared/types';

export interface AccountRecord {
  id: string;
  appId: string;
  name: string;
  config: Config;
  createdAt: number;
  updatedAt: number;
}

export interface OrderRecord {
  accountId: string;
  accountName: string;
  orderId: string;
  status: number;
  createTime: number;
  updateTime: number;
  indexedText: string;
  order: Order;
  source: StoredOrderSource;
  lastFetchedAt: number;
  lastChangedAt: number;
}

export interface AccountWorkspaceRecord {
  accountId: string;
  taskConfig: TaskConfig;
  scheduledJobs: ScheduledJob[];
  productSources: ProductSourceBinding[];
  orderAssociations: OrderAssociation[];
  realAddressCaches: OrderRealAddressCache[];
  rules: {
    skipKeywords: string[];
    blacklistRules: BlacklistRule[];
    statusRules: StatusRule[];
    violationWords: string[];
  };
  appSettings: AppSettings;
  notificationPreference: NotificationPreference;
  orderSyncStates: Record<string, OrderSyncAccountState>;
  updatedAt: number;
}

export type AccountLogKind = 'listing' | 'violation' | 'global' | 'notification';

export interface AccountLogRecord<TEntry = unknown> {
  id: string;
  accountId: string;
  kind: AccountLogKind;
  timestamp: number;
  entry: TEntry;
}

export interface AccountSyncStateRecord {
  accountId: string;
  appId: string;
  revision: number;
  checksum: string;
  dirty: boolean;
  lastPulledAt?: number;
  lastPushedAt?: number;
  sessionDeviceId?: string;
  updatedAt: number;
}

export class ExtensionDb extends Dexie {
  accounts!: Table<AccountRecord, string>;
  orders!: Table<OrderRecord, [string, string]>;
  accountWorkspaces!: Table<AccountWorkspaceRecord, string>;
  accountLogs!: Table<AccountLogRecord, string>;
  accountSyncStates!: Table<AccountSyncStateRecord, string>;

  constructor() {
    super('wishop-extension');
    this.version(1).stores({
      accounts: 'id, appId, updatedAt',
      orders: '[accountId+orderId], accountId, [accountId+status+updateTime], [accountId+createTime], [accountId+lastFetchedAt]',
      accountWorkspaces: 'accountId, updatedAt',
      accountLogs: 'id, accountId, kind, [accountId+kind+timestamp], timestamp',
      accountSyncStates: 'accountId, appId, revision, updatedAt',
    });
  }
}

export const extensionDb = new ExtensionDb();
