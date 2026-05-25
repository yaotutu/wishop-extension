// Shared types across main process, preload, and renderer

export interface Config {
  appId: string;
  appSecret: string;
}

export type ScheduledJobModule = 'listing' | 'orders' | 'violation' | 'store' | 'system';
export type ScheduledJobScope = 'account' | 'global' | 'system';
export type ScheduledJobType =
  | 'listing.submitDrafts'
  | 'orders.checkShipmentStatus'
  | 'orders.syncRecent'
  | 'orders.backfillHistory'
  | 'violation.scanProducts';
export type ScheduledJobStatus = 'idle' | 'running' | 'waiting_user' | 'completed' | 'failed' | 'skipped';

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

export interface ScheduledJob<TPayload = unknown> {
  id: string;
  name: string;
  enabled: boolean;
  module: ScheduledJobModule;
  jobType: ScheduledJobType;
  scope: ScheduledJobScope;
  accountId?: string;
  excludedAccountIds?: string[];
  cronExpression: string;
  staggerMinutes?: number;
  dailyLimit?: number;
  payload: TPayload;
  stats: ScheduledJobRunStats;
  accountStats?: Record<string, ScheduledJobRunStats>;
  nextRunAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduledJobRunNowResult {
  listed: number;
  status: ScheduledJobStatus;
  message?: string;
  error?: string;
}

export interface OrderHistoryBackfillPayload {
  lookbackDays?: number;
  cursorByAccountId?: Record<string, number>;
  completedAt?: number;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  runId: string;
  productId: string;
  productTitle: string;
  action: 'list' | 'delete' | 'check' | 'skip';
  status: 'success' | 'failed';
  errorCode?: number;
  errorMsg?: string;
}

export interface TaskConfig {
  listUnreviewed: boolean;
  listUnreviewedQuantity: number;
  autoDeleteFailed: boolean;
}

export interface DraftProduct {
  productId: string;
  title: string;
  headImgs: string[];
  status: number;
  editStatus: number;
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

export interface TaskCycleResult {
  scanned: number;
  deleted: number;
  listed: number;
  errors: number;
  skipped: number;
  stopped: boolean;
  reason?: string;
  errorCodes?: ErrorCodeSummary[];
  pendingCount?: number;
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
  createdAt: number;
  updatedAt: number;
}

export interface ProductSourceBinding {
  productId: string;
  sources: ProductSourceItem[];
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
}

export type LicensedFeature = 'orders' | 'listing' | 'violation' | 'shipping';

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
  scope: OrderScope;
  refreshedAccountIds: string[];
  failedAccounts: Array<{ accountId: string; accountName?: string; error: string }>;
  fetchedOrderCount?: number;
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

// Blacklist rule — error codes that should stop the task immediately
export interface BlacklistRule {
  code: number;
  description?: string;
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
  taskConfig: TaskConfig;
  listingLogs: LogEntry[];
  violationLogs: LogEntry[];
  violationWords: string[];
  productSources: ProductSourceBinding[];
  orderAssociations: OrderAssociation[];
  realAddressCaches: OrderRealAddressCache[];
  createdAt: number;
}
