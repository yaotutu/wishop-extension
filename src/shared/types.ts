// Shared types across main process, preload, and renderer

export interface Config {
  appId: string;
  appSecret: string;
}

export type ScheduledJobModule = 'productCopy' | 'productAudit' | 'orders' | 'violation' | 'store' | 'system';
export type ScheduledJobScope = 'account' | 'global' | 'system';
export type ScheduledJobType =
  | 'productAudit.submitDrafts'
  | 'orders.checkShipmentStatus'
  | 'orders.syncRecent'
  | 'orders.backfillHistory'
  | 'violation.scanProducts';
export type ScheduledJobStatus = 'idle' | 'running' | 'waiting_user' | 'completed' | 'failed' | 'skipped' | 'cancelled';
export type ScheduledJobRunMode = 'recurring' | 'untilComplete';

export interface ScheduledJobActiveRun {
  jobId: string;
  jobType: ScheduledJobType;
  runId: string;
  accountId?: string;
  startedAt: number;
  /**
   * 用户点击停止后先标记 requestedStopAt，再由执行器通过 AbortSignal 协作退出。
   * 这个字段只描述当前后台内存里的运行实例，不作为持久化任务状态来源。
   */
  requestedStopAt?: number;
}

export interface ScheduledJobStopRunResult {
  stoppedRunCount: number;
  message: string;
}

export interface ScheduledJobRunStats {
  lastRunDate: string;
  todayRunCount: number;
  lastRunAt?: number;
  lastFinishedAt?: number;
  lastStatus?: ScheduledJobStatus;
  lastMessage?: string;
  lastListed?: number;
  lastError?: string;
}

export interface ScheduledJobBase<TPayload = unknown> {
  id: string;
  name: string;
  enabled: boolean;
  module: ScheduledJobModule;
  jobType: ScheduledJobType;
  runMode: ScheduledJobRunMode;
  cronExpression: string;
  dailyLimit: number;
  payload: TPayload;
  completedAt: number | null;
  stats: ScheduledJobRunStats;
  createdAt: number;
  updatedAt: number;
}

export type AccountScheduledJob<TPayload = unknown> = ScheduledJobBase<TPayload> & {
  scope: 'account';
  accountId: string;
};

export type GlobalScheduledJob<TPayload = unknown> = ScheduledJobBase<TPayload> & {
  scope: 'global';
  excludedAccountIds: string[];
  staggerMinutes: number;
  accountStats: Record<string, ScheduledJobRunStats>;
};

export type SystemScheduledJob<TPayload = unknown> = ScheduledJobBase<TPayload> & {
  scope: 'system';
};

export type ScheduledJob<TPayload = unknown> =
  | AccountScheduledJob<TPayload>
  | GlobalScheduledJob<TPayload>
  | SystemScheduledJob<TPayload>;

export type AccountScheduledJobInput<TPayload = unknown> = Omit<AccountScheduledJob<TPayload>, 'id' | 'stats' | 'createdAt' | 'updatedAt'>;
export type GlobalScheduledJobInput<TPayload = unknown> = Omit<GlobalScheduledJob<TPayload>, 'id' | 'stats' | 'createdAt' | 'updatedAt'>;
export type SystemScheduledJobInput<TPayload = unknown> = Omit<SystemScheduledJob<TPayload>, 'id' | 'stats' | 'createdAt' | 'updatedAt'>;
export type ScheduledJobInput<TPayload = unknown> =
  | AccountScheduledJobInput<TPayload>
  | GlobalScheduledJobInput<TPayload>
  | SystemScheduledJobInput<TPayload>;

export type ScheduledJobView<TPayload = unknown> = ScheduledJob<TPayload> & {
  nextRunAt: number | null;
  activeRuns: ScheduledJobActiveRun[];
};

export interface ScheduledJobExecutorResult {
  listed: number;
  status: ScheduledJobStatus;
  message: string | null;
  error: string | null;
  completed: boolean;
}

export type ScheduledJobRunNowResult = ScheduledJobExecutorResult;

export interface OrderHistoryBackfillPayload {
  lookbackDays?: number;
  cursorByAccountId?: Record<string, number>;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  runId: string;
  productId: string;
  productTitle: string;
  action: 'list' | 'submitAudit' | 'delete' | 'check' | 'skip' | 'keepDraft' | 'stopTask';
  status: 'success' | 'failed';
  errorCode?: number;
  errorMsg?: string;
  decisionAction?: ProductAuditFailureAction;
  decisionReason?: string;
  matchedRuleId?: string;
}

export type ProductAuditFailureAction = 'stopTask' | 'keepDraft' | 'deleteDraft';
export type ProductAuditFailureDefaultAction = 'keepDraft' | 'deleteDraft';
export type ProductAuditFailureRuleMatch =
  | { type: 'outerErrorCode'; code: number }
  | { type: 'embeddedErrorCode'; code: number }
  | { type: 'keyword'; keyword: string };

/**
 * 商品提审失败处理规则只在微信提审接口返回失败后生效。
 * 提审成功时不会进入这套规则管道，也不会触发停止、保留或删除动作。
 */
export interface ProductAuditFailureRule {
  id: string;
  enabled: boolean;
  action: ProductAuditFailureAction;
  match: ProductAuditFailureRuleMatch;
  description?: string;
  priority?: number;
}

/**
 * 商品提审失败策略是全局配置，单账号手动任务和全账号定时任务共用这一套策略。
 */
export interface ProductAuditFailurePolicy {
  rules: ProductAuditFailureRule[];
  defaultAction: ProductAuditFailureDefaultAction;
}

export interface ProductAuditFailureDecision {
  action: ProductAuditFailureAction;
  reason: string;
  matchedRule?: ProductAuditFailureRule;
  outerErrorCode: number;
  embeddedErrorCodes: number[];
}

export interface ProductAuditTaskConfig {
  submitUnauditedDrafts: boolean;
  submitLimit: number;
}

export interface ProductAuditTaskResult {
  scanned: number;
  submitted: number;
  kept: number;
  deleted: number;
  errors: number;
  skipped: number;
  stopped: boolean;
  reason?: string;
  errorCodes?: ErrorCodeSummary[];
  pendingCount?: number;
}

export interface DraftProduct {
  productId: string;
  title: string;
  headImgs: string[];
  status: number;
  editStatus: number;
}

/**
 * 从执行记录发起草稿删除时，页面只传商品定位信息。
 * 后台会用 accountId 找到统一微信小店 client，不允许页面接触 token 或 appSecret。
 */
export interface DraftProductDeleteInput {
  productId: string;
  productTitle?: string;
  runId?: string;
}

/**
 * 草稿删除结果需要保留微信错误码，方便用户把不可删除原因回看成执行记录。
 */
export interface DraftProductDeleteResult {
  success: boolean;
  errorCode?: number;
  error?: string;
}

export interface QuotaResult {
  quota: number;
  total: number;
  source?: 'cache' | 'api';
  fetchedAt?: number;
  elapsedMs?: number;
}

export interface ErrorCodeSummary {
  code: number;
  count: number;
  msg: string;
}

export interface Account {
  id: string;
  name: string;
  config: Config;
  createdAt: number;
}

export type AddLogFn = (log: Omit<LogEntry, 'id' | 'timestamp'>) => void;

export interface ProductSourceItem {
  id: string;
  url: string;
  quantity: number;
  remark: string;
  sourceType?: 'manual' | 'productCopy' | '1688';
  sourcePlatform?: 'taobao' | 'tmall' | '1688' | 'manual';
  sourceItemId?: string;
  sourceTitle?: string;
  createdBy?: 'manual' | 'productCopy';
  createdAt: number;
  updatedAt: number;
}

export interface ProductSourceBinding {
  productId: string;
  sources: ProductSourceItem[];
}

export interface ProductQrcodeResult {
  productId: string;
  qrcodeUrl: string;
}

export type LinkedOrderPlatform = 'taobao' | 'tmall' | '1688' | 'manual';
export type PurchaseShipmentCheckStatus = 'queued' | 'running' | 'waiting_user' | 'completed' | 'failed' | 'skipped';

export interface LinkedPlatformOrder {
  id: string;
  platform: LinkedOrderPlatform;
  platformOrderId: string;
  platformOrderStatus: string;
  logisticsStatus: string;
  logisticsCompany?: string;
  trackingNumber?: string;
  remark?: string;
  lastShipmentCheckQueuedAt?: number;
  lastShipmentCheckStartedAt?: number;
  lastShipmentCheckFinishedAt?: number;
  lastShipmentCheckStatus?: PurchaseShipmentCheckStatus;
  lastShipmentCheckError?: string;
  nextShipmentCheckAfter?: number;
  createdAt: number;
  updatedAt: number;
}

export interface OrderAssociation {
  orderId: string;
  internalRemark: string;
  linkedOrders: LinkedPlatformOrder[];
  createdAt: number;
  updatedAt: number;
}

export type PurchaseLookupSessionStatus = 'created' | 'queued' | 'opened' | 'page-ready' | 'waiting-user-verification' | 'completed' | 'failed';
export type TaobaoWorkspaceRole = 'shipping' | 'background-task';

export interface CreateTaobaoRefundSessionInput {
  accountId: string;
  orderId: string;
  platformOrderId: string;
  reason?: string;
  autoSubmit?: boolean;
}

export type TaobaoRefundSessionStatus = 'created' | 'opened' | 'page-ready' | 'waiting-user-verification' | 'prepared' | 'submitted' | 'failed';

export interface TaobaoRefundSession {
  id: string;
  accountId: string;
  orderId: string;
  platformOrderId: string;
  reason: string;
  autoSubmit: boolean;
  status: TaobaoRefundSessionStatus;
  tabId?: number;
  lastError?: string;
  challenge?: TaobaoSecurityChallengeSnapshot;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface TaobaoRefundPrepareSnapshot {
  platformOrderId: string;
  selectedReason: string;
  refundAmountText: string;
  submitReady: boolean;
  autoSubmitted?: boolean;
  url: string;
}

export type TaobaoSecurityChallengeKind = 'login' | 'slider' | 'captcha' | 'access-denied' | 'unknown';

export interface TaobaoSecurityChallengeSnapshot {
  detected: boolean;
  kind: TaobaoSecurityChallengeKind;
  reason: string;
  title: string;
  url: string;
  matchedSignals: string[];
}

export interface TaobaoPurchaseOrderSnapshot {
  platformOrderId: string;
  platformOrderStatus: string;
  logisticsStatus: string;
  logisticsCompany?: string;
  trackingNumber?: string;
  remark?: string;
}

export interface TaobaoProductSkuSpec {
  pid?: string;
  vid?: string;
  name: string;
  value: string;
}

export interface TaobaoProductSkuGroup {
  pid?: string;
  name: string;
  values: string[];
}

export interface TaobaoProductSkuPropertyValue {
  vid?: string;
  name: string;
  imageUrl?: string;
}

export interface TaobaoProductSkuProperty {
  pid?: string;
  name: string;
  values: TaobaoProductSkuPropertyValue[];
}

export interface TaobaoProductSkuMatrixItem {
  id: string;
  skuId?: string;
  propPath?: string;
  specs: TaobaoProductSkuSpec[];
  priceText: string;
  priceMoney?: number;
  stockText: string;
  quantity?: number;
  imageUrl: string;
  logisticsTime?: string;
}

export interface TaobaoProductParam {
  name: string;
  value: string;
  group: 'basic' | 'enhance' | 'other';
}

export interface TaobaoProductSellerSnapshot {
  shopName: string;
  sellerId: string;
  shopId: string;
}

export interface TaobaoProductSourceCategorySnapshot {
  id?: string;
  name?: string;
  path?: string[];
}

export type TaobaoProductImageRole = 'main' | 'detail' | 'sku' | 'fallback' | 'unknown';
export type TaobaoProductImageSource = 'pageModel' | 'detailDom' | 'documentDom' | 'skuModel' | 'fallback';

export interface TaobaoProductImageAsset {
  url: string;
  normalizedUrl: string;
  role: TaobaoProductImageRole;
  source: TaobaoProductImageSource;
  sourceSelector?: string;
  width?: number;
  height?: number;
  naturalWidth?: number;
  naturalHeight?: number;
  lazyAttrs?: Record<string, string>;
  flags: string[];
}

export interface TaobaoProductDetailContent {
  text: string;
  source: 'detailDom' | 'documentDom' | 'pageModel' | 'none';
  images: TaobaoProductImageAsset[];
}

export interface TaobaoProductCollectionDiagnostics {
  usedPageModel: boolean;
  usedDocumentFallback: boolean;
  sources: Record<string, string>;
  warnings: string[];
}

export interface TaobaoProductSnapshot {
  identity: {
    url: string;
    platform: 'taobao' | 'tmall';
    itemId: string;
  };
  title: string;
  shop: {
    name: string;
  };
  category: {
    source?: TaobaoProductSourceCategorySnapshot;
  };
  seller: TaobaoProductSellerSnapshot;
  price: {
    rangeText: string;
  };
  images: {
    main: string[];
    detail: string[];
    assets: TaobaoProductImageAsset[];
  };
  detail: {
    text: string;
    source: TaobaoProductDetailContent['source'];
    images: string[];
  };
  params: TaobaoProductParam[];
  sku: {
    groups: TaobaoProductSkuGroup[];
    properties: TaobaoProductSkuProperty[];
    matrix: TaobaoProductSkuMatrixItem[];
  };
  sales: {
    text: string;
  };
  delivery: {
    text: string;
  };
  rawModel?: unknown;
  diagnostics: TaobaoProductCollectionDiagnostics;
  collectedAt: number;
}

export interface ProductCopyRecord extends TaobaoProductSnapshot {
  id: string;
  sourceUrl: string;
  missingFields: string[];
  updatedAt: number;
}

export interface ProductCopyCreatedProductRecord {
  id: string;
  accountId: string;
  copyId: string;
  platform: 'taobao' | 'tmall';
  itemId: string;
  sourceUrl: string;
  title: string;
  productId: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateProductCopySessionInput {
  url: string;
}

export interface WxProductDraftAttribute {
  attrKey: string;
  attrValue: string;
}

export interface WxCategoryProductRuleAttr {
  name: string;
  type: string;
  values: string[];
  required: boolean;
  appendAllowed: boolean;
  hint?: string;
}

export interface WxCategoryProductRuleCacheItem {
  id: string;
  catId: string;
  catIds: string[];
  categoryPath: string[];
  path: string;
  releaseMode: number;
  productAttrs: WxCategoryProductRuleAttr[];
  saleAttrs: WxCategoryProductRuleAttr[];
  requiredProductAttrs: WxCategoryProductRuleAttr[];
  fetchedByAccountId: string;
  updatedAt: number;
  lastError?: string;
}

export interface WxCategoryProductRuleCacheStatus {
  total: number;
  cached: number;
  failed: number;
  missing: number;
  syncing: boolean;
  processed: number;
  skipped: number;
  startedAt?: number;
  finishedAt?: number;
  currentCatId?: string;
  currentPath?: string;
  lastUpdatedAt?: number;
  lastError?: string;
}

export interface SyncWxCategoryProductRulesInput {
  accountId: string;
  force?: boolean;
  limit?: number;
}

export interface SyncWxCategoryProductRulesResult extends WxCategoryProductRuleCacheStatus {
  started: boolean;
}

export interface ProductCopyCategoryOption {
  key: string;
  catIds: string[];
  names: string[];
  path: string;
}

export interface ProductCopyFreightTemplateOption {
  templateId: string;
  name?: string;
  label: string;
}

export interface ProductCopyAfterSaleAddressOption {
  addressId: string;
  label: string;
  defaultSend: boolean;
  defaultRecv: boolean;
  sendAddr: boolean;
  recvAddr: boolean;
}

export interface ProductCopyDraftParameterOptions {
  categories: ProductCopyCategoryOption[];
  freightTemplates: ProductCopyFreightTemplateOption[];
  afterSaleAddresses: ProductCopyAfterSaleAddressOption[];
  fetchedAt: number;
}

export type ProductCopyPriceRounding = 'cent' | 'jiao' | 'yuan';

export interface ProductCopyPricingSettings {
  multiplier: number;
  addAmountFen: number;
  rounding: ProductCopyPriceRounding;
}

export interface ProductCopyContentSettings {
  titlePrefix: string;
  titleSuffix: string;
  mainImageSkipFirst: number;
  mainImageSkipLast: number;
  detailImageSkipFirst: number;
  detailImageSkipLast: number;
  maxDetailImages?: number;
}

export interface ProductCopySkuSettings {
  defaultStockNum: number;
  unifiedStockNum?: number;
  zeroStockReplacement?: number;
  minSkuPriceFen?: number;
}

export interface ProductCopyDefaultSettings {
  accountId: string;
  expressTemplateId?: string;
  afterSaleAddressId?: string;
  brandId?: string;
  autoSourceBinding: boolean;
  pricing: ProductCopyPricingSettings;
  content: ProductCopyContentSettings;
  sku: ProductCopySkuSettings;
  updatedAt: number;
}

export type ProductCopyDefaultSettingsPatch = Partial<Omit<ProductCopyDefaultSettings, 'accountId' | 'updatedAt'>>;

export interface WxProductCategoryPath {
  catIds: string[];
  names: string[];
  leaf: boolean;
  qualificationTips?: string[];
}

export type WxProductCategoryCandidateSource = 'wxStaticSnapshot';

export type WxProductCategoryCandidateScope = 'wxStaticAll';

export interface WxProductCategoryCandidate extends WxProductCategoryPath {
  source: WxProductCategoryCandidateSource;
}

export interface WxProductCategoryLookupSummary {
  source: WxProductCategoryCandidateSource;
  status: 'matched';
  candidateScope?: WxProductCategoryCandidateScope;
  candidateCount: number;
  warnings: string[];
}

export interface WxProductDraftPreparedAttr {
  attr_key: string;
  attr_value: string;
}

export interface WxProductDraftPreparedSku {
  thumb_img: string;
  sale_price: number;
  stock_num: number;
  sku_code?: string;
  sku_attrs: WxProductDraftPreparedAttr[];
  sku_deliver_info: {
    stock_type: number;
  };
}

export interface WxProductDraftPreparedRequest {
  out_product_id: string;
  title: string;
  short_title?: string;
  head_imgs: string[];
  deliver_method: number;
  deliver_acct_type: number[];
  desc_info?: {
    imgs?: string[];
    desc?: string;
  };
  cats: [];
  cats_v2: Array<{ cat_id: string }>;
  attrs?: WxProductDraftPreparedAttr[];
  brand_id?: string;
  express_info?: {
    template_id: string;
  };
  after_sale_info?: {
    after_sale_address_id: number;
  };
  extra_service: {
    is_open_cod: number;
    seven_day_return: number;
    freight_insurance: number;
  };
  skus: WxProductDraftPreparedSku[];
  listing: 0 | 1;
}

export type WxProductDraftBoxPreparedRequest = WxProductDraftPreparedRequest & { listing: 0 };

export interface CreateWxDraftBoxProductInput {
  accountId: string;
  copyId: string;
  catIds: string[];
  expressTemplateId?: string;
  afterSaleAddressId?: string;
  brandId?: string;
  defaultStockNum?: number;
  pricing?: ProductCopyPricingSettings;
  content?: ProductCopyContentSettings;
  sku?: ProductCopySkuSettings;
  autoSourceBinding?: boolean;
  attrs?: WxProductDraftAttribute[];
}

export type CreateWxDraftBoxProductPrepareInput = CreateWxDraftBoxProductInput;

interface WxProductDraftPrepareResultSummary {
  title: string;
  headImageCount: number;
  detailImageCount: number;
  skuCount: number;
  attrCount: number;
}

export interface WxDraftBoxProductPrepareResult {
  accountId: string;
  copyId: string;
  request: WxProductDraftBoxPreparedRequest;
  uploadedImageCount: number;
  preparedAt: number;
  warnings: string[];
  summary: WxProductDraftPrepareResultSummary & {
    listing: false;
  };
}

export interface CreatePreparedWxDraftBoxProductInput {
  accountId: string;
  copyId: string;
  request: WxProductDraftBoxPreparedRequest;
  uploadedImageCount: number;
  autoSourceBinding?: boolean;
}

export interface WxProductDraftCreationResult {
  accountId: string;
  copyId: string;
  productId: string;
  createTime?: string;
  listing: 0;
  uploadedImageCount: number;
}

export interface DeleteCreatedWxDraftBoxProductInput {
  accountId: string;
  copyId: string;
  productId: string;
  productTitle?: string;
}

export interface DeleteCreatedWxDraftBoxProductResult {
  accountId: string;
  copyId: string;
  productId: string;
  deleted: boolean;
  errorCode?: number;
  error?: string;
}

export interface CreateWxProductDraftSuggestionInput {
  accountId?: string;
  copyId: string;
}

export interface WxProductDraftSuggestionResult {
  copyId: string;
  catIds: string[];
  categoryPath?: string[];
  categoryCandidateSource?: WxProductCategoryCandidateSource;
  categoryCandidates?: WxProductCategoryCandidate[];
  categoryLookup?: WxProductCategoryLookupSummary;
  attrs: WxProductDraftAttribute[];
  confidence: number;
  reason: string;
  warnings: string[];
}

export interface ProductAuditCategoryPrecheckInput {
  accountId: string;
  catId: string;
}

export interface ProductAuditCategoryPrecheckResult {
  accountId: string;
  catId: string;
  allPass: boolean;
  failReasons: string[];
  checkedAt: number;
}

export type ProductCopySessionStatus =
  | 'created'
  | 'queued'
  | 'opened'
  | 'page-ready'
  | 'waiting-user-verification'
  | 'completed'
  | 'failed';

export interface ProductCopySession {
  id: string;
  url: string;
  status: ProductCopySessionStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  tabId?: number;
  copyId?: string;
  lastError?: string;
  challenge?: TaobaoSecurityChallengeSnapshot;
}

export interface PurchaseLookupSession {
  id: string;
  accountId: string;
  orderId: string;
  platformOrderId: string;
  status: PurchaseLookupSessionStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  tabId?: number;
  lastError?: string;
  challenge?: TaobaoSecurityChallengeSnapshot;
}

export interface CreatePurchaseLookupSessionInput {
  accountId: string;
  orderId: string;
  platformOrderId: string;
}

export interface ShipOrderFromPurchaseInput {
  accountId: string;
  orderId: string;
  logisticsCompany: string;
  trackingNumber: string;
  deliveryId?: string;
  sourceAction?: 'manual' | 'auto';
}

export interface ShipOrderFromPurchaseResult {
  order: Order;
  deliveryId: string;
  deliveryName: string;
  waybillId: string;
}

export interface DeliveryCompanyOption {
  deliveryId: string;
  deliveryName: string;
}

export interface OrderRealAddressCache {
  orderId: string;
  address: OrderAddressInfo;
  fetchedAt: number;
  updatedAt: number;
}

export type ShippingSessionStatus = 'created' | 'opened' | 'page-ready' | 'completed' | 'failed';
export type ShippingPurchaseAssociationStatus = 'waiting-payment' | 'detected' | 'associated' | 'failed';
export type ShippingPaymentWorkflow = 'manualPasswordPayment';

export interface ShippingOrderSnapshot {
  orderId: string;
  productId: string;
  title: string;
  skuCode?: string;
  skuAttrs: OrderSkuAttr[];
  quantity: number;
  thumbImg?: string;
  address?: OrderAddressInfo;
  merchantNotes?: string;
  customerNotes?: string;
  createTime?: number;
  payTime?: number;
  orderPrice?: number;
  estimatedCommissionFee?: number;
}

export interface ShippingSourceSnapshot {
  id: string;
  url: string;
  quantity: number;
  remark: string;
}

export interface ShippingSession {
  id: string;
  accountId: string;
  orderId: string;
  productId: string;
  source: ShippingSourceSnapshot;
  order: ShippingOrderSnapshot;
  paymentWorkflow: ShippingPaymentWorkflow;
  status: ShippingSessionStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  tabId?: number;
  lastError?: string;
  purchaseAssociationStatus?: ShippingPurchaseAssociationStatus;
  purchaseAssociationMessage?: string;
  linkedPlatformOrderId?: string;
}

export interface CreateShippingSessionInput {
  accountId: string;
  orderId: string;
  productId: string;
  source: ShippingSourceSnapshot;
  order: ShippingOrderSnapshot;
  paymentWorkflow?: ShippingPaymentWorkflow;
}

export type LicensedFeature = 'orders' | 'productCopy' | 'productAudit' | 'violation' | 'shipping';

export interface LicenseActivationInput {
  licenseKey: string;
}

export interface LicenseState {
  enforcementEnabled: boolean;
  status: 'inactive' | 'active' | 'expired' | 'invalid' | 'grace';
  plan: 'none' | 'paid';
  licenseKey?: string;
  deviceId: string;
  activatedAt?: number;
  expiresAt?: number;
  checkedAt?: number;
  lastError?: string;
}

// Order types

export enum OrderStatus {
  PendingPayment = 10,
  GiftPendingAccept = 12,
  GroupBuying = 13,
  PendingShipment = 20,
  PartialShipment = 21,
  PendingReceipt = 30,
  Completed = 100,
  CancelledByAfterSale = 200,
  CancelledByUser = 250,
}

export type OrderTimeScope = 'all' | '7d' | '30d' | '90d';

export interface OrderSkuAttr {
  attr_key: string;
  attr_value: string;
}

export interface OrderProductInfo {
  product_id: string;
  sku_id: string;
  thumb_img: string;
  sku_cnt: number;
  sale_price: number;
  title: string;
  sku_code: string;
  market_price: number;
  sku_attrs: OrderSkuAttr[];
  real_price: number;
  estimate_price: number;
  on_aftersale_sku_cnt: number;
  finish_aftersale_sku_cnt: number;
  delivery_deadline?: number;
}

export interface OrderAftersaleListItem {
  aftersale_order_id: string;
  /**
   * 微信订单详情接口里的这个 status 官方已标记废弃。
   * 这里只保留原始字段形状，业务展示必须以售后详情接口返回的 status 为准。
   */
  status?: number;
}

export interface OrderAftersaleDetail {
  aftersale_order_list?: OrderAftersaleListItem[];
  on_aftersale_order_cnt?: number;
}

export type AfterSaleOrderStatus =
  | 'USER_CANCELD'
  | 'MERCHANT_PROCESSING'
  | 'MERCHANT_REJECT_REFUND'
  | 'MERCHANT_REJECT_RETURN'
  | 'USER_WAIT_RETURN'
  | 'RETURN_CLOSED'
  | 'MERCHANT_WAIT_RECEIPT'
  | 'MERCHANT_OVERDUE_REFUND'
  | 'MERCHANT_REFUND_SUCCESS'
  | 'MERCHANT_RETURN_SUCCESS'
  | 'PLATFORM_REFUNDING'
  | 'PLATFORM_REFUND_FAIL'
  | 'USER_WAIT_CONFIRM'
  | 'MERCHANT_REFUND_RETRY_FAIL'
  | 'MERCHANT_FAIL'
  | 'USER_WAIT_CONFIRM_UPDATE'
  | 'USER_WAIT_HANDLE_MERCHANT_AFTER_SALE'
  | 'WAIT_PACKAGE_INTERCEPT'
  | 'MERCHANT_REJECT_EXCHANGE'
  | 'MERCHANT_REJECT_RESHIP'
  | 'USER_WAIT_RECEIPT'
  | 'MERCHANT_EXCHANGE_SUCCESS'
  | (string & {});

export type AfterSaleOrderType = 'REFUND' | 'RETURN' | 'EXCHANGE' | (string & {});

export interface AfterSaleProductInfo {
  product_id?: string;
  sku_id?: string;
  count?: number;
}

export interface WxAfterSaleOrder {
  after_sale_order_id: string;
  status: AfterSaleOrderStatus;
  order_id?: string;
  product_info?: AfterSaleProductInfo;
  type?: AfterSaleOrderType;
  reason_text?: string;
  create_time?: number;
  update_time?: number;
  complete_time?: number;
}

export interface OrderAftersaleSummaryItem {
  afterSaleOrderId: string;
  status?: AfterSaleOrderStatus;
  statusText: string;
  type?: AfterSaleOrderType;
  productId?: string;
  skuId?: string;
  count?: number;
  updateTime?: number;
  completeTime?: number;
}

export interface OrderAftersaleSummary {
  hasAftersale: true;
  status?: AfterSaleOrderStatus;
  statusText: string;
  onAftersaleOrderCount: number;
  onAftersaleSkuCount: number;
  finishAftersaleSkuCount: number;
  items: OrderAftersaleSummaryItem[];
  detailFetchFailed?: boolean;
}

export interface OrderPriceInfo {
  product_price: number;
  order_price: number;
  freight: number;
  discounted_price: number;
  original_order_price: number;
  merchant_receieve_price: number;
}

export interface OrderSettleInfo {
  commission_fee?: number;
  predict_commission_fee?: number;
}

export interface OrderAddressInfo {
  user_name: string;
  postal_code: string;
  province_name: string;
  city_name: string;
  county_name: string;
  detail_info: string;
  tel_number: string;
  purchaser_tel_number?: string;
  virtual_order_tel_number?: string;
  national_code?: string;
  house_number: string;
  virtual_number_info?: OrderVirtualNumberInfo;
}

export interface OrderVirtualNumberInfo {
  virtual_number: string;
  extension: string;
  expiration: number;
  number_state: number;
}

export interface OrderDeliveryProductInfo {
  waybill_id: string;
  delivery_id: string;
  delivery_name: string;
  delivery_time: number;
}

export interface OrderDeliveryInfo {
  address_info: OrderAddressInfo;
  delivery_product_info: OrderDeliveryProductInfo[];
  ship_done_time: number;
  deliver_method: number;
}

export interface OrderExtInfo {
  customer_notes: string;
  merchant_notes: string;
  confirm_receipt_time: number;
}

export interface OrderPayInfo {
  pay_time: number;
  transaction_id: string;
  payment_method: number;
}

export interface OrderDetail {
  product_infos: OrderProductInfo[];
  price_info: OrderPriceInfo;
  settle_info?: OrderSettleInfo;
  pay_info: OrderPayInfo;
  delivery_info: OrderDeliveryInfo;
  ext_info: OrderExtInfo;
}

export interface Order {
  order_id: string;
  status: OrderStatus;
  create_time: number;
  update_time: number;
  order_detail: OrderDetail;
  aftersale_detail?: OrderAftersaleDetail;
  aftersale_summary?: OrderAftersaleSummary;
}

export interface OrderListParams {
  page_size?: number;
  next_key?: string;
  status?: OrderStatus;
  create_time_range?: { start_time: number; end_time: number };
  update_time_range?: { start_time: number; end_time: number };
  order_id?: string;
}

export interface OrderListResult {
  order_id_list: string[];
  next_key: string;
  has_more: boolean;
}

export interface OrderSearchParams {
  search_type: 'order_id' | 'title' | 'user_name' | 'tel_number_last4' | 'merchant_notes' | 'customer_notes';
  keyword: string;
  status?: OrderStatus;
  next_key?: string;
  page_size?: number;
}

export type OrderScope =
  | { type: 'all' }
  | { type: 'account'; accountId: string };

export type OrderSearchSource = 'local' | 'remote';

export type StoredOrderSource = 'autoSync' | 'manualRefresh' | 'historyBackfill' | 'remoteSearch' | 'detailRefresh';

export interface StoredOrderSnapshot {
  accountId: string;
  accountName: string;
  orderId: string;
  order: Order;
  indexedText: string;
  lastFetchedAt: number;
  lastChangedAt: number;
  source: StoredOrderSource;
}

export interface OrderListFilters {
  status?: OrderStatus;
  aftersaleOnly?: boolean;
  search?: OrderSearchParams | null;
  timeScope?: OrderTimeScope;
  pageSize?: number;
  cursor?: string;
  nowSeconds?: number;
}

export interface LocalOrderListResult {
  orders: StoredOrderSnapshot[];
  hasMore: boolean;
  total: number;
  nextCursor?: string;
}

export interface OrderSyncAccountState {
  accountId: string;
  accountName?: string;
  running: boolean;
  lastStartedAt?: number;
  lastFinishedAt?: number;
  lastSuccessAt?: number;
  lastError?: string;
  nextSyncAt?: number;
}

export interface OrderSyncState {
  scope: OrderScope;
  running: boolean;
  lastStartedAt?: number;
  lastFinishedAt?: number;
  lastSuccessAt?: number;
  lastError?: string;
  nextSyncAt?: number;
  accountStates: OrderSyncAccountState[];
}

export interface OrderRefreshResult {
  status: 'completed' | 'partial_failed' | 'failed';
  scope: OrderScope;
  refreshedAccountIds: string[];
  failedAccounts: Array<{ accountId: string; accountName?: string; error: string }>;
  fetchedOrderCount: number;
  updatedOrderCount: number;
  startedAt: number;
  finishedAt: number;
}

export interface ViolationMatch {
  productId: string;
  title: string;
  matchedWords: string[];
}

export interface ViolationScanResult {
  scanned: number;
  violations: ViolationMatch[];
  errors: number;
  stopped: boolean;
  reason?: string;
}

// Status rule — maps editStatus codes to actions during task cycle
export type StatusAction = 'submit' | 'delete' | 'skip';

export interface StatusRule {
  editStatus: number;  // 微信小店商品的 edit_status 值
  label: string;       // 中文标签，如"编辑中"、"审核中"
  action: StatusAction; // 对应操作：submit=提交审核, delete=删除, skip=跳过
}

// Full account with all data (main process only)
export interface FullAccount {
  id: string;
  name: string;
  config: Config;
  productAuditConfig: ProductAuditTaskConfig;
  productAuditLogs: LogEntry[];
  violationLogs: LogEntry[];
  violationWords: string[];
  productSources: ProductSourceBinding[];
  orderAssociations: OrderAssociation[];
  realAddressCaches: OrderRealAddressCache[];
  createdAt: number;
}
