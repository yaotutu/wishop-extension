import type { ActivityLogEntry } from './activity-log';
import type { NotificationEntry, NotificationPreference } from './notification';
import type { AppSettings, AppSettingsPatch, ViolationWordsSettings } from './settings';
import type {
  Account,
  ProductCopyCreatedProductRecord,
  ProductCopyDefaultSettings,
  ProductCopyDefaultSettingsPatch,
  ProductCopyDraftParameterOptions,
  ProductCopyRecord,
  Config,
  CreatePreparedWxDraftBoxProductInput,
  CreateProductCopySessionInput,
  CreateWxDraftBoxProductInput,
  CreateWxDraftBoxProductPrepareInput,
  CreateWxProductDraftSuggestionInput,
  DeleteCreatedWxDraftBoxProductInput,
  DeleteCreatedWxDraftBoxProductResult,
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
  ProductCopySession,
  ProductAuditCategoryPrecheckInput,
  ProductAuditCategoryPrecheckResult,
  ProductAuditFailurePolicy,
  ProductAuditTaskConfig,
  ProductAuditTaskResult,
  PurchaseLookupSession,
  QuotaResult,
  ScheduledJob,
  ScheduledJobInput,
  ScheduledJobView,
  ScheduledJobRunNowResult,
  ScheduledJobStopRunResult,
  ShippingSession,
  TaobaoRefundPrepareSnapshot,
  TaobaoRefundSession,
  StatusRule,
  TaobaoWorkspaceRole,
  TaobaoLoginSnapshot,
  TaobaoSecurityChallengeSnapshot,
  TaobaoPurchaseOrderSnapshot,
  TaobaoProductSnapshot,
  ScanItem,
  ComplianceScanResult,
  ViolationWordModule,
  SyncWxCategoryProductRulesInput,
  WxDraftBoxProductPrepareResult,
  WxProductDraftSuggestionResult,
  WxProductDraftCreationResult,
  SyncWxCategoryProductRulesResult,
  WxCategoryProductRuleCacheStatus,
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

  'productCopy:list': { args: []; result: ProductCopyRecord[] };
  'productCopy:remove': { args: [copyId: string]; result: void };
  'productCopy:getDraftParameterOptions': { args: [accountId: string]; result: ProductCopyDraftParameterOptions };
  'productCopy:getCreatedProduct': { args: [accountId: string, copyId: string]; result: ProductCopyCreatedProductRecord | null };
  'productCopy:getDefaultSettings': { args: [accountId: string]; result: ProductCopyDefaultSettings };
  'productCopy:saveDefaultSettings': { args: [accountId: string, patch: ProductCopyDefaultSettingsPatch]; result: ProductCopyDefaultSettings };
  'productCopy:open': { args: [input: CreateProductCopySessionInput]; result: ProductCopySession };
  'productCopy:getCurrentTabSession': { args: []; result: ProductCopySession | null };
  'productCopy:markPageReady': { args: [sessionId: string]; result: ProductCopySession };
  'productCopy:reportChallenge': { args: [sessionId: string, snapshot: TaobaoSecurityChallengeSnapshot]; result: ProductCopySession };
  'productCopy:resolveChallenge': { args: [sessionId: string]; result: ProductCopySession };
  'productCopy:complete': { args: [sessionId: string, snapshot: TaobaoProductSnapshot]; result: ProductCopyRecord };
  'productCopy:fail': { args: [sessionId: string, error: string]; result: ProductCopySession };
  'productCopy:suggestWxCategoryFromFullList': { args: [input: CreateWxProductDraftSuggestionInput]; result: WxProductDraftSuggestionResult };
  'productCopy:prepareWxDraftBoxProduct': { args: [input: CreateWxDraftBoxProductPrepareInput]; result: WxDraftBoxProductPrepareResult };
  'productCopy:createPreparedWxDraftBoxProduct': { args: [input: CreatePreparedWxDraftBoxProductInput]; result: WxProductDraftCreationResult };
  'productCopy:createWxDraftBoxProduct': { args: [input: CreateWxDraftBoxProductInput]; result: WxProductDraftCreationResult };
  'productCopy:deleteCreatedWxDraftBoxProduct': { args: [input: DeleteCreatedWxDraftBoxProductInput]; result: DeleteCreatedWxDraftBoxProductResult };

  'wxCategoryData:downloadProductRules': { args: [input: SyncWxCategoryProductRulesInput]; result: SyncWxCategoryProductRulesResult };
  'wxCategoryData:getProductRuleCacheStatus': { args: []; result: WxCategoryProductRuleCacheStatus };

  'shipping:open': { args: [input: CreateShippingSessionInput]; result: ShippingSession };
  'shipping:getCurrentTabSession': { args: []; result: ShippingSession | null };
  'shipping:markPageReady': { args: [sessionId: string]; result: ShippingSession };
  'shipping:complete': { args: [sessionId: string]; result: ShippingSession };
  'shipping:fail': { args: [sessionId: string, error: string]; result: ShippingSession };
  'taobaoWorkspace:getCurrentRole': { args: []; result: TaobaoWorkspaceRole | null };
  // 淘宝登录态：getState 读内存态、probeNow 触发一次即时探测、reportFromContent 由 content 主动回报。
  'taobaoLogin:getState': { args: []; result: TaobaoLoginSnapshot };
  'taobaoLogin:probeNow': { args: []; result: TaobaoLoginSnapshot };
  'taobaoLogin:reportFromContent': { args: [snapshot: TaobaoLoginSnapshot]; result: void };
  'taobaoLogin:openLoginPage': { args: []; result: void };

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
  'scheduledJobs:stopRun': { args: [jobId: string]; result: ScheduledJobStopRunResult };

  'productAudit:configGet': { args: [accountId: string]; result: ProductAuditTaskConfig };
  'productAudit:configSet': { args: [accountId: string, config: ProductAuditTaskConfig]; result: void };
  'productAudit:run': { args: [accountId: string, config: ProductAuditTaskConfig]; result: ProductAuditTaskResult };
  'productAudit:stop': { args: [accountId: string]; result: void };
  'productAudit:precheckCategory': { args: [input: ProductAuditCategoryPrecheckInput]; result: ProductAuditCategoryPrecheckResult };

  'violationWords:getGlobal': { args: []; result: string[] };
  'violationWords:setGlobal': { args: [words: string[]]; result: void };
  'violationWords:getModule': { args: [module: ViolationWordModule]; result: string[] };
  'violationWords:setModule': { args: [module: ViolationWordModule, words: string[]]; result: void };
  'violationWords:getDefaults': { args: []; result: { words: string[]; totalCount: number; violationWords: string[]; brands: string[]; source: string; updatedAt: string; version: number } };
  'violationWords:getSettings': { args: []; result: ViolationWordsSettings };
  'compliance:batchScan': { args: [accountId: string, limit?: number]; result: ComplianceScanResult };
  'compliance:scanStep': {
    args: [accountId: string, action: 'next' | 'skip' | 'delete'];
    result:
      | { type: 'done'; scanned?: number; reason?: string }
      | { type: 'stopped'; reason?: string }
      | ({ type: 'violation'; scanned: number } & ScanItem);
  };
  'compliance:batchDelete': { args: [accountId: string, violations: ScanItem[]]; result: { deleted: number; errors: number; stopped: boolean } };
  'compliance:stop': { args: [accountId: string]; result: void };

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
