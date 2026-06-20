import Dexie, { type Table } from 'dexie';
import type { NotificationPreference } from '../../shared/notification';
import type { AppSettings } from '../../shared/settings';
import type {
  Config,
  ProductCopyCreatedProductRecord,
  ProductCopyDefaultSettings,
  ProductCopyRecord,
  Order,
  OrderAssociation,
  OrderRealAddressCache,
  OrderSyncAccountState,
  ProductAuditFailureDefaultAction,
  ProductAuditFailureRule,
  ProductAuditTaskConfig,
  ProductSourceBinding,
  ScheduledJob,
  StatusRule,
  StoredOrderSource,
  WxCategoryProductRuleCacheItem,
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
  productAuditConfig: ProductAuditTaskConfig;
  scheduledJobs: ScheduledJob[];
  productSources: ProductSourceBinding[];
  orderAssociations: OrderAssociation[];
  realAddressCaches: OrderRealAddressCache[];
  rules: {
    productAuditRules: ProductAuditFailureRule[];
    productAuditDefaultFailureAction: ProductAuditFailureDefaultAction;
    statusRules: StatusRule[];
    // 违禁词已全局化：不再随账号存储。globalViolationWords 是所有模块共享的通用词库；
    // moduleViolationWords 按模块名（如 'productCopy'）存放各业务域的补充词库。
    // 两者都写在 '__global_rules__' 这条全局 workspace 上，跨账号共享。
    globalViolationWords: string[];
    moduleViolationWords: Record<string, string[]>;
  };
  appSettings: AppSettings;
  notificationPreference: NotificationPreference;
  orderSyncStates: Record<string, OrderSyncAccountState>;
  updatedAt: number;
}

export type AccountLogKind = 'productAudit' | 'compliance' | 'activity' | 'notification';

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
  productCopyRecords!: Table<ProductCopyRecord, string>;
  productCopyCreatedProducts!: Table<ProductCopyCreatedProductRecord, string>;
  productCopyDefaultSettings!: Table<ProductCopyDefaultSettings, string>;
  wxCategoryProductRules!: Table<WxCategoryProductRuleCacheItem, string>;

  constructor() {
    super('dianxiaoqi-extension');
    this.version(1).stores({
      accounts: 'id, appId, updatedAt',
      orders: '[accountId+orderId], accountId, [accountId+status+updateTime], [accountId+createTime], [accountId+lastFetchedAt]',
      accountWorkspaces: 'accountId, updatedAt',
      accountLogs: 'id, accountId, kind, [accountId+kind+timestamp], timestamp',
      accountSyncStates: 'accountId, appId, revision, updatedAt',
    });
    this.version(2).stores({
      accounts: 'id, appId, updatedAt',
      orders: '[accountId+orderId], accountId, [accountId+status+updateTime], [accountId+createTime], [accountId+lastFetchedAt]',
      accountWorkspaces: 'accountId, updatedAt',
      accountLogs: 'id, accountId, kind, [accountId+kind+timestamp], timestamp',
      accountSyncStates: 'accountId, appId, revision, updatedAt',
      collectedProductListings: 'id, [platform+itemId], updatedAt, collectedAt',
    });
    this.version(3).stores({
      accounts: 'id, appId, updatedAt',
      orders: '[accountId+orderId], accountId, [accountId+status+updateTime], [accountId+createTime], [accountId+lastFetchedAt]',
      accountWorkspaces: 'accountId, updatedAt',
      accountLogs: 'id, accountId, kind, [accountId+kind+timestamp], timestamp',
      accountSyncStates: 'accountId, appId, revision, updatedAt',
      collectedProductListings: 'id, updatedAt, collectedAt',
    }).upgrade(async tx => {
      await tx.table('collectedProductListings').clear();
    });
    this.version(4).stores({
      accounts: 'id, appId, updatedAt',
      orders: '[accountId+orderId], accountId, [accountId+status+updateTime], [accountId+createTime], [accountId+lastFetchedAt]',
      accountWorkspaces: 'accountId, updatedAt',
      accountLogs: 'id, accountId, kind, [accountId+kind+timestamp], timestamp',
      accountSyncStates: 'accountId, appId, revision, updatedAt',
      collectedProductListings: 'id, updatedAt, collectedAt',
      wxCategoryProductRules: 'id, catId, releaseMode, updatedAt, lastError',
    });
    this.version(5).stores({
      accounts: 'id, appId, updatedAt',
      orders: '[accountId+orderId], accountId, [accountId+status+updateTime], [accountId+createTime], [accountId+lastFetchedAt]',
      accountWorkspaces: 'accountId, updatedAt',
      accountLogs: 'id, accountId, kind, [accountId+kind+timestamp], timestamp',
      accountSyncStates: 'accountId, appId, revision, updatedAt',
      // Dexie 只能通过旧表名显式声明 null 来删除历史表；新代码只读写 productCopyRecords。
      collectedProductListings: null,
      productCopyRecords: 'id, updatedAt, collectedAt',
      wxCategoryProductRules: 'id, catId, releaseMode, updatedAt, lastError',
    });
    this.version(6).stores({
      accounts: 'id, appId, updatedAt',
      orders: '[accountId+orderId], accountId, [accountId+status+updateTime], [accountId+createTime], [accountId+lastFetchedAt]',
      accountWorkspaces: 'accountId, updatedAt',
      accountLogs: 'id, accountId, kind, [accountId+kind+timestamp], timestamp',
      accountSyncStates: 'accountId, appId, revision, updatedAt',
      productCopyRecords: 'id, updatedAt, collectedAt',
      productCopyCreatedProducts: 'id, accountId, copyId, productId, updatedAt',
      wxCategoryProductRules: 'id, catId, releaseMode, updatedAt, lastError',
    });
    this.version(7).stores({
      accounts: 'id, appId, updatedAt',
      orders: '[accountId+orderId], accountId, [accountId+status+updateTime], [accountId+createTime], [accountId+lastFetchedAt]',
      accountWorkspaces: 'accountId, updatedAt',
      accountLogs: 'id, accountId, kind, [accountId+kind+timestamp], timestamp',
      accountSyncStates: 'accountId, appId, revision, updatedAt',
      productCopyRecords: 'id, updatedAt, collectedAt',
      productCopyCreatedProducts: 'id, accountId, copyId, productId, updatedAt',
      productCopyDefaultSettings: 'accountId, updatedAt',
      wxCategoryProductRules: 'id, catId, releaseMode, updatedAt, lastError',
    });
    // linkSource 字段成为 LinkedPlatformOrder 必填字段，旧关联数据缺少该字段，直接清空重建。
    this.version(8).stores({
      accounts: 'id, appId, updatedAt',
      orders: '[accountId+orderId], accountId, [accountId+status+updateTime], [accountId+createTime], [accountId+lastFetchedAt]',
      accountWorkspaces: 'accountId, updatedAt',
      accountLogs: 'id, accountId, kind, [accountId+kind+timestamp], timestamp',
      accountSyncStates: 'accountId, appId, revision, updatedAt',
      productCopyRecords: 'id, updatedAt, collectedAt',
      productCopyCreatedProducts: 'id, accountId, copyId, productId, updatedAt',
      productCopyDefaultSettings: 'accountId, updatedAt',
      wxCategoryProductRules: 'id, catId, releaseMode, updatedAt, lastError',
    }).upgrade(async tx => {
      await tx.table('accountWorkspaces').toCollection().modify(workspace => {
        workspace.orderAssociations = [];
      });
    });
  }
}

export const extensionDb = new ExtensionDb();
