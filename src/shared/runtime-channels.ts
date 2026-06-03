import type { ActivityLogEntry } from './activity-log';
import type { NotificationEntry, NotificationPreference } from './notification';
import type { AppSettings, AppSettingsPatch } from './settings';
import type {
  Account,
  CollectedProductListing,
  Config,
  CreateProductListingCollectionSessionInput,
  CreateWxProductDraftPrepareInput,
  CreateWxProductDraftSuggestionInput,
  CreateWxProductDraftInput,
  CreateShippingSessionInput,
  DeliveryCompanyOption,
  DraftProduct,
  DraftProductDeleteInput,
  DraftProductDeleteResult,
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
  ProductQrcodeResult,
  ProductListingCollectionSession,
  ProductAuditFailurePolicy,
  ProductAuditTaskConfig,
  ProductAuditTaskResult,
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
  TaobaoProductSnapshot,
  ViolationMatch,
  ViolationScanResult,
  SubmitPreparedWxProductDraftInput,
  WxProductDraftPrepareResult,
  WxProductDraftSuggestionResult,
  WxProductDraftCreationResult,
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
  'drafts:submitAudit': { args: [accountId: string, productId: string]; result: { success: boolean; error?: string } };
  'drafts:delete': { args: [accountId: string, input: DraftProductDeleteInput]; result: DraftProductDeleteResult };

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
  'products:getQrcode': { args: [accountId: string, productId: string]; result: ProductQrcodeResult };

  'productListingCollection:list': { args: []; result: CollectedProductListing[] };
  'productListingCollection:remove': { args: [listingId: string]; result: void };
  'productListingCollection:open': { args: [input: CreateProductListingCollectionSessionInput]; result: ProductListingCollectionSession };
  'productListingCollection:getCurrentTabSession': { args: []; result: ProductListingCollectionSession | null };
  'productListingCollection:markPageReady': { args: [sessionId: string]; result: ProductListingCollectionSession };
  'productListingCollection:reportChallenge': { args: [sessionId: string, snapshot: TaobaoSecurityChallengeSnapshot]; result: ProductListingCollectionSession };
  'productListingCollection:resolveChallenge': { args: [sessionId: string]; result: ProductListingCollectionSession };
  'productListingCollection:complete': { args: [sessionId: string, snapshot: TaobaoProductSnapshot]; result: CollectedProductListing };
  'productListingCollection:fail': { args: [sessionId: string, error: string]; result: ProductListingCollectionSession };
  'productListingCollection:suggestWxDraft': { args: [input: CreateWxProductDraftSuggestionInput]; result: WxProductDraftSuggestionResult };
  'productListingCollection:suggestWxCategoryFromFullList': { args: [input: CreateWxProductDraftSuggestionInput]; result: WxProductDraftSuggestionResult };
  'productListingCollection:prepareWxDraft': { args: [input: CreateWxProductDraftPrepareInput]; result: WxProductDraftPrepareResult };
  'productListingCollection:submitPreparedWxDraft': { args: [input: SubmitPreparedWxProductDraftInput]; result: WxProductDraftCreationResult };
  'productListingCollection:createWxDraft': { args: [input: CreateWxProductDraftInput]; result: WxProductDraftCreationResult };

  'shipping:open': { args: [input: CreateShippingSessionInput]; result: ShippingSession };
  'shipping:getCurrentTabSession': { args: []; result: ShippingSession | null };
  'shipping:markPageReady': { args: [sessionId: string]; result: ShippingSession };
  'shipping:complete': { args: [sessionId: string]; result: ShippingSession };
  'shipping:fail': { args: [sessionId: string, error: string]; result: ShippingSession };
  'taobaoWorkspace:getCurrentRole': { args: []; result: TaobaoWorkspaceRole | null };

  'quota:get': { args: [accountId: string, force?: boolean]; result: QuotaResult };

  'productAudit:logsGet': { args: [accountId: string]; result: LogEntry[] };
  'productAudit:logsClear': { args: [accountId: string]; result: void };
  'activityLogs:list': { args: []; result: ActivityLogEntry[] };
  'activityLogs:clear': { args: []; result: void };
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

  'productAudit:configGet': { args: [accountId: string]; result: ProductAuditTaskConfig };
  'productAudit:configSet': { args: [accountId: string, config: ProductAuditTaskConfig]; result: void };
  'productAudit:run': { args: [accountId: string, config: ProductAuditTaskConfig]; result: ProductAuditTaskResult };
  'productAudit:stop': { args: [accountId: string]; result: void };

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

  'productAudit:failurePolicyGet': { args: []; result: ProductAuditFailurePolicy };
  'productAudit:failurePolicyGetDefaults': { args: []; result: ProductAuditFailurePolicy };
  'productAudit:failurePolicySet': { args: [policy: ProductAuditFailurePolicy]; result: void };
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
