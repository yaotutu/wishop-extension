// Shared types across main process, preload, and renderer

export interface Config {
  appId: string;
  appSecret: string;
}

export interface ScheduledTask {
  id: string;
  name: string;
  enabled: boolean;
  cronExpression: string;
  dailyLimit: number;
  taskConfig: TaskConfig;
  lastRunDate: string;
  todayListedCount: number;
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

export interface OrderAddressInfo {
  user_name: string;
  postal_code: string;
  province_name: string;
  city_name: string;
  county_name: string;
  detail_info: string;
  tel_number: string;
  house_number: string;
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
  schedulers: ScheduledTask[];
  taskConfig: TaskConfig;
  logs: LogEntry[];
  violationWords: string[];
  createdAt: number;
}
