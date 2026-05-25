import type { GlobalLogEntry } from './global-log';
import type { NotificationEntry, NotificationPreference } from './notification';
import type { AppSettings, AppSettingsPatch } from './settings';
import type {
  Account,
  BlacklistRule,
  Config,
  CreateShippingSessionInput,
  DeliveryCompanyOption,
  DraftProduct,
  LicenseActivationInput,
  LicenseState,
  LogEntry,
  Order,
  OrderAddressInfo,
  OrderAssociation,
  OrderListFilters,
  LocalOrderListResult,
  OrderRefreshResult,
  OrderRealAddressCache,
  OrderSearchParams,
  OrderScope,
  OrderSearchSource,
  OrderSyncState,
  ShipOrderFromPurchaseInput,
  ShipOrderFromPurchaseResult,
  CreatePurchaseLookupSessionInput,
  CreateTaobaoRefundSessionInput,
  ProductSourceBinding,
  ProductSourceItem,
  PurchaseLookupSession,
  QuotaResult,
  ScheduledJob,
  ScheduledJobInput,
  ScheduledJobView,
  ScheduledJobRunNowResult,
  ShippingSession,
  TaobaoRefundPrepareSnapshot,
  TaobaoRefundSession,
  StatusRule,
  TaobaoWorkspaceRole,
  TaobaoSecurityChallengeSnapshot,
  TaobaoPurchaseOrderSnapshot,
  TaskConfig,
  TaskCycleResult,
  ViolationMatch,
  ViolationScanResult,
} from './types';

export interface RuntimeChannels {
  'accounts:list': { args: []; result: Account[] };
  'accounts:add': { args: [name: string, config: Config]; result: Account };
  'accounts:remove': { args: [accountId: string]; result: void };
  'accounts:update': { args: [accountId: string, patch: Partial<Pick<Account, 'name' | 'config'>>]; result: void };
  'accounts:getActive': { args: []; result: string };
  'accounts:setActive': { args: [accountId: string]; result: void };
  'config:get': { args: [accountId: string]; result: Config };
  'config:set': { args: [accountId: string, config: Config]; result: { success: boolean; error?: string } };

  'drafts:fetch': { args: [accountId: string, reset?: boolean]; result: { products: DraftProduct[]; hasMore: boolean } };
  'drafts:list': { args: [accountId: string, productId: string]; result: { success: boolean; error?: string } };

  'orders:list': {
    args: [scope: OrderScope, filters?: OrderListFilters];
    result: LocalOrderListResult;
  };
  'orders:detail': { args: [accountId: string, orderId: string, options?: { refresh?: boolean }]; result: Order };
  'orders:search': {
    args: [scope: OrderScope, params: OrderSearchParams, source: OrderSearchSource];
    result: LocalOrderListResult;
  };
  'orders:refresh': { args: [scope: OrderScope]; result: OrderRefreshResult };
  'orders:syncState': { args: [scope: OrderScope]; result: OrderSyncState };
  'orders:decodeAddress': { args: [accountId: string, orderId: string]; result: OrderAddressInfo };
  'orders:listDeliveryCompanies': { args: [accountId: string]; result: DeliveryCompanyOption[] };
  'orders:shipFromPurchase': { args: [input: ShipOrderFromPurchaseInput]; result: ShipOrderFromPurchaseResult };

  'orderRealAddresses:list': { args: [accountId: string]; result: OrderRealAddressCache[] };
  'orderRealAddresses:get': { args: [accountId: string, orderId: string]; result: OrderRealAddressCache | null };
  'orderRealAddresses:fetch': { args: [accountId: string, orderId: string]; result: OrderRealAddressCache };
  'orderRealAddresses:refresh': { args: [accountId: string, orderId: string]; result: OrderRealAddressCache };

  'orderAssociations:list': { args: [accountId: string]; result: OrderAssociation[] };
  'orderAssociations:set': {
    args: [accountId: string, orderId: string, input: Pick<OrderAssociation, 'internalRemark' | 'linkedOrders'>];
    result: OrderAssociation;
  };

  'purchaseLookup:open': { args: [input: CreatePurchaseLookupSessionInput]; result: PurchaseLookupSession };
  'purchaseLookup:getCurrentTabSession': { args: []; result: PurchaseLookupSession | null };
  'purchaseLookup:markPageReady': { args: [sessionId: string]; result: PurchaseLookupSession };
  'purchaseLookup:reportChallenge': { args: [sessionId: string, snapshot: TaobaoSecurityChallengeSnapshot]; result: PurchaseLookupSession };
  'purchaseLookup:resolveChallenge': { args: [sessionId: string]; result: PurchaseLookupSession };
  'purchaseLookup:complete': { args: [sessionId: string, snapshot: TaobaoPurchaseOrderSnapshot]; result: OrderAssociation };
  'purchaseLookup:fail': { args: [sessionId: string, error: string]; result: PurchaseLookupSession };

  'taobaoRefund:open': { args: [input: CreateTaobaoRefundSessionInput]; result: TaobaoRefundSession };
  'taobaoRefund:getCurrentTabSession': { args: []; result: TaobaoRefundSession | null };
  'taobaoRefund:markPageReady': { args: [sessionId: string]; result: TaobaoRefundSession };
  'taobaoRefund:reportChallenge': { args: [sessionId: string, snapshot: TaobaoSecurityChallengeSnapshot]; result: TaobaoRefundSession };
  'taobaoRefund:resolveChallenge': { args: [sessionId: string]; result: TaobaoRefundSession };
  'taobaoRefund:prepared': { args: [sessionId: string, snapshot: TaobaoRefundPrepareSnapshot]; result: TaobaoRefundSession };
  'taobaoRefund:submitted': { args: [sessionId: string, snapshot: TaobaoRefundPrepareSnapshot]; result: TaobaoRefundSession };
  'taobaoRefund:fail': { args: [sessionId: string, error: string]; result: TaobaoRefundSession };

  'productSources:list': { args: [accountId: string]; result: ProductSourceBinding[] };
  'productSources:set': { args: [accountId: string, productId: string, sources: ProductSourceItem[]]; result: ProductSourceBinding };
  'productSources:remove': { args: [accountId: string, productId: string, sourceId: string]; result: ProductSourceBinding };

  'shipping:open': { args: [input: CreateShippingSessionInput]; result: ShippingSession };
  'shipping:getCurrentTabSession': { args: []; result: ShippingSession | null };
  'shipping:markPageReady': { args: [sessionId: string]; result: ShippingSession };
  'shipping:complete': { args: [sessionId: string]; result: ShippingSession };
  'shipping:fail': { args: [sessionId: string, error: string]; result: ShippingSession };
  'taobaoWorkspace:getCurrentRole': { args: []; result: TaobaoWorkspaceRole | null };

  'quota:get': { args: [accountId: string, force?: boolean]; result: QuotaResult };

  'listingLogs:get': { args: [accountId: string]; result: LogEntry[] };
  'listingLogs:clear': { args: [accountId: string]; result: void };
  'globalLogs:list': { args: []; result: GlobalLogEntry[] };
  'globalLogs:clear': { args: []; result: void };
  'notifications:list': { args: []; result: NotificationEntry[] };
  'notifications:markRead': { args: [notificationId: string]; result: NotificationEntry[] };
  'notifications:markAllRead': { args: []; result: NotificationEntry[] };
  'notifications:clear': { args: []; result: void };
  'notifications:getPreference': { args: []; result: NotificationPreference };
  'notifications:updatePreference': { args: [patch: Partial<NotificationPreference>]; result: NotificationPreference };
  'settings:get': { args: []; result: AppSettings };
  'settings:update': { args: [patch: AppSettingsPatch]; result: AppSettings };

  'scheduledJobs:list': { args: []; result: ScheduledJobView[] };
  'scheduledJobs:add': { args: [job: ScheduledJobInput]; result: ScheduledJob };
  'scheduledJobs:update': { args: [jobId: string, patch: Partial<ScheduledJob>]; result: void };
  'scheduledJobs:remove': { args: [jobId: string]; result: void };
  'scheduledJobs:runNow': { args: [jobId: string]; result: ScheduledJobRunNowResult };

  'taskConfig:get': { args: [accountId: string]; result: TaskConfig };
  'taskConfig:set': { args: [accountId: string, config: TaskConfig]; result: void };
  'task:run': { args: [accountId: string, config: TaskConfig]; result: TaskCycleResult };
  'task:stop': { args: [accountId: string]; result: void };

  'violation:getWords': { args: [accountId: string]; result: string[] };
  'violation:setWords': { args: [accountId: string, words: string[]]; result: void };
  'violation:batchScan': { args: [accountId: string, limit?: number]; result: ViolationScanResult };
  'violation:scanStep': {
    args: [accountId: string, action: 'next' | 'skip' | 'delete'];
    result:
      | { type: 'done'; scanned?: number; reason?: string }
      | { type: 'stopped'; reason?: string }
      | ({ type: 'violation'; scanned: number } & ViolationMatch);
  };
  'violation:batchDelete': { args: [accountId: string, violations: ViolationMatch[]]; result: { deleted: number; errors: number; stopped: boolean } };
  'violation:stop': { args: [accountId: string]; result: void };

  'blacklistRules:get': { args: []; result: BlacklistRule[] };
  'blacklistRules:getDefaultCodes': { args: []; result: number[] };
  'blacklistRules:set': { args: [rules: BlacklistRule[]]; result: void };
  'skipKeywords:get': { args: []; result: string[] };
  'skipKeywords:set': { args: [keywords: string[]]; result: void };
  'statusRules:get': { args: []; result: StatusRule[] };
  'statusRules:set': { args: [rules: StatusRule[]]; result: void };
  'statusRules:reset': { args: []; result: StatusRule[] };

  'license:get': { args: []; result: LicenseState };
  'license:activate': { args: [input: LicenseActivationInput]; result: LicenseState };
  'license:refresh': { args: []; result: LicenseState };
  'license:clear': { args: []; result: LicenseState };

  'app:version': { args: []; result: string };
}

export type RuntimeChannel = keyof RuntimeChannels;
export type RuntimeArgs<K extends RuntimeChannel> = RuntimeChannels[K]['args'];
export type RuntimeResult<K extends RuntimeChannel> = RuntimeChannels[K]['result'];
