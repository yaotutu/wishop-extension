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
  ShippingSession,
  StatusRule,
  TaobaoWorkspaceRole,
  TaobaoRefundPrepareSnapshot,
  TaobaoRefundSession,
  TaobaoSecurityChallengeSnapshot,
  TaobaoPurchaseOrderSnapshot,
  TaskConfig,
  TaskCycleResult,
  ViolationMatch,
  ViolationScanResult,
} from './types';
import type { GlobalLogEntry } from './global-log';
import type { NotificationEntry, NotificationPreference } from './notification';
import type { AppSettings, AppSettingsPatch } from './settings';
import type { RuntimeArgs, RuntimeChannel, RuntimeResult } from './runtime-channels';

let devRuntimeReloadScheduled = false;

function shouldAutoReloadRuntime(errorMessage: string): boolean {
  return import.meta.env.DEV && errorMessage.startsWith('Unknown runtime channel:');
}

function scheduleDevRuntimeReload(errorMessage: string): void {
  if (devRuntimeReloadScheduled) return;
  devRuntimeReloadScheduled = true;
  console.warn(`[wishop] ${errorMessage}。开发环境检测到前后台版本不一致，正在自动重新加载插件。`);
  window.setTimeout(() => {
    try {
      const runtime = chrome.runtime as typeof chrome.runtime & { reload?: () => void };
      runtime.reload?.();
    } catch (error) {
      console.warn('[wishop] 自动重新加载插件失败，请手动在 chrome://extensions 重新加载。', error);
    }
  }, 300);
}

async function invoke<K extends RuntimeChannel>(channel: K, ...args: RuntimeArgs<K>): Promise<RuntimeResult<K>> {
  const response = await chrome.runtime.sendMessage({ channel, args }) as { ok?: boolean; result?: unknown; error?: string };
  if (!response?.ok) {
    const message = response?.error || `Runtime request failed: ${channel}`;
    if (shouldAutoReloadRuntime(message)) {
      scheduleDevRuntimeReload(message);
      throw new Error('后台服务还是旧版本，插件已自动重新加载。请重新打开后台管理页后再试。');
    }
    throw new Error(message);
  }
  return response.result as RuntimeResult<K>;
}

function onRuntimeEvent<T>(event: string, callback: (payload: T) => void): () => void {
  const listener = (message: { type?: string; event?: string; payload?: T }) => {
    if (message?.type === 'event' && message.event === event) {
      callback(message.payload as T);
    }
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

export const extensionApi = {
  accounts: {
    list: (): Promise<Account[]> => invoke('accounts:list'),
    add: (name: string, config: Config): Promise<Account> => invoke('accounts:add', name, config),
    remove: (accountId: string): Promise<void> => invoke('accounts:remove', accountId),
    update: (accountId: string, patch: Partial<Pick<Account, 'name' | 'config'>>): Promise<void> => invoke('accounts:update', accountId, patch),
    getActive: (): Promise<string> => invoke('accounts:getActive'),
    setActive: (accountId: string): Promise<void> => invoke('accounts:setActive', accountId),
  },
  config: {
    get: (accountId: string): Promise<Config> => invoke('config:get', accountId),
    set: (accountId: string, config: Config): Promise<{ success: boolean; error?: string }> => invoke('config:set', accountId, config),
  },
  drafts: {
    fetch: (accountId: string, reset?: boolean): Promise<{ products: DraftProduct[]; hasMore: boolean }> => invoke('drafts:fetch', accountId, reset),
    list: (accountId: string, productId: string): Promise<{ success: boolean; error?: string }> => invoke('drafts:list', accountId, productId),
  },
  orders: {
    list: (
      scope: OrderScope,
      filters?: OrderListFilters,
    ): Promise<LocalOrderListResult> => invoke('orders:list', scope, filters),
    detail: (accountId: string, orderId: string, options?: { refresh?: boolean }): Promise<Order> => invoke('orders:detail', accountId, orderId, options),
    search: (
      scope: OrderScope,
      params: OrderSearchParams,
      source: OrderSearchSource,
    ): Promise<LocalOrderListResult> => invoke('orders:search', scope, params, source),
    refresh: (scope: OrderScope): Promise<OrderRefreshResult> => invoke('orders:refresh', scope),
    syncState: (scope: OrderScope): Promise<OrderSyncState> => invoke('orders:syncState', scope),
    decodeAddress: (accountId: string, orderId: string): Promise<OrderAddressInfo> => invoke('orders:decodeAddress', accountId, orderId),
    listDeliveryCompanies: (accountId: string): Promise<DeliveryCompanyOption[]> => invoke('orders:listDeliveryCompanies', accountId),
    shipFromPurchase: (input: ShipOrderFromPurchaseInput): Promise<ShipOrderFromPurchaseResult> =>
      invoke('orders:shipFromPurchase', input),
  },
  orderAssociations: {
    list: (accountId: string): Promise<OrderAssociation[]> => invoke('orderAssociations:list', accountId),
    set: (
      accountId: string,
      orderId: string,
      input: Pick<OrderAssociation, 'internalRemark' | 'linkedOrders'>,
    ): Promise<OrderAssociation> => invoke('orderAssociations:set', accountId, orderId, input),
  },
  purchaseLookup: {
    open: (input: CreatePurchaseLookupSessionInput): Promise<PurchaseLookupSession> => invoke('purchaseLookup:open', input),
    getCurrentTabSession: (): Promise<PurchaseLookupSession | null> => invoke('purchaseLookup:getCurrentTabSession'),
    markPageReady: (sessionId: string): Promise<PurchaseLookupSession> => invoke('purchaseLookup:markPageReady', sessionId),
    reportChallenge: (sessionId: string, snapshot: TaobaoSecurityChallengeSnapshot): Promise<PurchaseLookupSession> =>
      invoke('purchaseLookup:reportChallenge', sessionId, snapshot),
    resolveChallenge: (sessionId: string): Promise<PurchaseLookupSession> => invoke('purchaseLookup:resolveChallenge', sessionId),
    complete: (sessionId: string, snapshot: TaobaoPurchaseOrderSnapshot): Promise<OrderAssociation> =>
      invoke('purchaseLookup:complete', sessionId, snapshot),
    fail: (sessionId: string, error: string): Promise<PurchaseLookupSession> => invoke('purchaseLookup:fail', sessionId, error),
    onCompleted: (callback: (association: OrderAssociation) => void) => onRuntimeEvent('purchaseLookup:completed', callback),
    onFailed: (callback: (payload: { accountId: string; orderId: string; error: string }) => void) =>
      onRuntimeEvent('purchaseLookup:failed', callback),
    onChallenge: (callback: (payload: { accountId: string; orderId: string; reason: string }) => void) =>
      onRuntimeEvent('purchaseLookup:challenge', callback),
  },
  taobaoRefund: {
    open: (input: CreateTaobaoRefundSessionInput): Promise<TaobaoRefundSession> => invoke('taobaoRefund:open', input),
    getCurrentTabSession: (): Promise<TaobaoRefundSession | null> => invoke('taobaoRefund:getCurrentTabSession'),
    markPageReady: (sessionId: string): Promise<TaobaoRefundSession> => invoke('taobaoRefund:markPageReady', sessionId),
    reportChallenge: (sessionId: string, snapshot: TaobaoSecurityChallengeSnapshot): Promise<TaobaoRefundSession> =>
      invoke('taobaoRefund:reportChallenge', sessionId, snapshot),
    resolveChallenge: (sessionId: string): Promise<TaobaoRefundSession> => invoke('taobaoRefund:resolveChallenge', sessionId),
    prepared: (sessionId: string, snapshot: TaobaoRefundPrepareSnapshot): Promise<TaobaoRefundSession> =>
      invoke('taobaoRefund:prepared', sessionId, snapshot),
    submitted: (sessionId: string, snapshot: TaobaoRefundPrepareSnapshot): Promise<TaobaoRefundSession> =>
      invoke('taobaoRefund:submitted', sessionId, snapshot),
    fail: (sessionId: string, error: string): Promise<TaobaoRefundSession> => invoke('taobaoRefund:fail', sessionId, error),
    onPrepared: (callback: (session: TaobaoRefundSession) => void) => onRuntimeEvent('taobaoRefund:prepared', callback),
    onSubmitted: (callback: (session: TaobaoRefundSession) => void) => onRuntimeEvent('taobaoRefund:submitted', callback),
    onFailed: (callback: (payload: { accountId: string; orderId: string; error: string }) => void) =>
      onRuntimeEvent('taobaoRefund:failed', callback),
    onChallenge: (callback: (payload: { accountId: string; orderId: string; reason: string }) => void) =>
      onRuntimeEvent('taobaoRefund:challenge', callback),
  },
  orderRealAddresses: {
    list: (accountId: string): Promise<OrderRealAddressCache[]> => invoke('orderRealAddresses:list', accountId),
    get: (accountId: string, orderId: string): Promise<OrderRealAddressCache | null> => invoke('orderRealAddresses:get', accountId, orderId),
    fetch: (accountId: string, orderId: string): Promise<OrderRealAddressCache> => invoke('orderRealAddresses:fetch', accountId, orderId),
    refresh: (accountId: string, orderId: string): Promise<OrderRealAddressCache> => invoke('orderRealAddresses:refresh', accountId, orderId),
  },
  productSources: {
    list: (accountId: string): Promise<ProductSourceBinding[]> => invoke('productSources:list', accountId),
    set: (accountId: string, productId: string, sources: ProductSourceItem[]): Promise<ProductSourceBinding> => invoke('productSources:set', accountId, productId, sources),
    remove: (accountId: string, productId: string, sourceId: string): Promise<ProductSourceBinding> => invoke('productSources:remove', accountId, productId, sourceId),
  },
  shipping: {
    open: (input: CreateShippingSessionInput): Promise<ShippingSession> => invoke('shipping:open', input),
    getCurrentTabSession: (): Promise<ShippingSession | null> => invoke('shipping:getCurrentTabSession'),
    markPageReady: (sessionId: string): Promise<ShippingSession> => invoke('shipping:markPageReady', sessionId),
    complete: (sessionId: string): Promise<ShippingSession> => invoke('shipping:complete', sessionId),
    fail: (sessionId: string, error: string): Promise<ShippingSession> => invoke('shipping:fail', sessionId, error),
    onPurchaseDetected: (callback: (session: ShippingSession) => void) => onRuntimeEvent('shipping:purchaseDetected', callback),
    onPurchaseAssociated: (callback: (payload: { session: ShippingSession; association: OrderAssociation }) => void) =>
      onRuntimeEvent('shipping:purchaseAssociated', callback),
    onPurchaseAssociationFailed: (callback: (session: ShippingSession) => void) =>
      onRuntimeEvent('shipping:purchaseAssociationFailed', callback),
  },
  taobaoWorkspace: {
    getCurrentRole: (): Promise<TaobaoWorkspaceRole | null> => invoke('taobaoWorkspace:getCurrentRole'),
  },
  quota: {
    get: (accountId: string, force = false): Promise<QuotaResult> => invoke('quota:get', accountId, force),
  },
  listingLogs: {
    get: (accountId: string): Promise<LogEntry[]> => invoke('listingLogs:get', accountId),
    clear: (accountId: string): Promise<void> => invoke('listingLogs:clear', accountId),
    onAdded: (accountId: string, callback: (log: LogEntry) => void) => onRuntimeEvent(`listingLog:added:${accountId}`, callback),
  },
  globalLogs: {
    list: (): Promise<GlobalLogEntry[]> => invoke('globalLogs:list'),
    clear: (): Promise<void> => invoke('globalLogs:clear'),
    onAdded: (callback: (log: GlobalLogEntry) => void) => onRuntimeEvent('globalLog:added', callback),
  },
  notifications: {
    list: (): Promise<NotificationEntry[]> => invoke('notifications:list'),
    markRead: (notificationId: string): Promise<NotificationEntry[]> => invoke('notifications:markRead', notificationId),
    markAllRead: (): Promise<NotificationEntry[]> => invoke('notifications:markAllRead'),
    clear: (): Promise<void> => invoke('notifications:clear'),
    getPreference: (): Promise<NotificationPreference> => invoke('notifications:getPreference'),
    updatePreference: (patch: Partial<NotificationPreference>): Promise<NotificationPreference> =>
      invoke('notifications:updatePreference', patch),
    onAdded: (callback: (notification: NotificationEntry) => void) => onRuntimeEvent('notification:added', callback),
    onChanged: (callback: (notifications: NotificationEntry[]) => void) => onRuntimeEvent('notification:changed', callback),
    onPreferenceChanged: (callback: (preference: NotificationPreference) => void) =>
      onRuntimeEvent('notification:preferenceChanged', callback),
  },
  settings: {
    get: (): Promise<AppSettings> => invoke('settings:get'),
    update: (patch: AppSettingsPatch): Promise<AppSettings> => invoke('settings:update', patch),
  },
  scheduledJobs: {
    list: (): Promise<ScheduledJob[]> => invoke('scheduledJobs:list'),
    add: (job: Omit<ScheduledJob, 'id' | 'stats' | 'createdAt' | 'updatedAt'>): Promise<ScheduledJob> =>
      invoke('scheduledJobs:add', job),
    update: (jobId: string, patch: Partial<ScheduledJob>): Promise<void> => invoke('scheduledJobs:update', jobId, patch),
    remove: (jobId: string): Promise<void> => invoke('scheduledJobs:remove', jobId),
  },
  taskConfig: {
    get: (accountId: string): Promise<TaskConfig> => invoke('taskConfig:get', accountId),
    set: (accountId: string, config: TaskConfig): Promise<void> => invoke('taskConfig:set', accountId, config),
  },
  task: {
    run: (accountId: string, config: TaskConfig): Promise<TaskCycleResult> => invoke('task:run', accountId, config),
    stop: (accountId: string): Promise<void> => invoke('task:stop', accountId),
  },
  violation: {
    getWords: (accountId: string): Promise<string[]> => invoke('violation:getWords', accountId),
    setWords: (accountId: string, words: string[]): Promise<void> => invoke('violation:setWords', accountId, words),
    batchScan: (accountId: string, limit?: number): Promise<ViolationScanResult> => invoke('violation:batchScan', accountId, limit),
    scanStep: (accountId: string, action: 'next' | 'skip' | 'delete'): Promise<
      | { type: 'done'; scanned?: number; reason?: string }
      | { type: 'stopped'; reason?: string }
      | ({ type: 'violation'; scanned: number } & ViolationMatch)
    > => invoke('violation:scanStep', accountId, action),
    batchDelete: (accountId: string, violations: ViolationMatch[]): Promise<{ deleted: number; errors: number; stopped: boolean }> => invoke('violation:batchDelete', accountId, violations),
    stop: (accountId: string): Promise<void> => invoke('violation:stop', accountId),
    onLog: (accountId: string, callback: (log: LogEntry) => void) => onRuntimeEvent(`violationLog:added:${accountId}`, callback),
  },
  blacklistRules: {
    get: (): Promise<BlacklistRule[]> => invoke('blacklistRules:get'),
    getDefaultCodes: (): Promise<number[]> => invoke('blacklistRules:getDefaultCodes'),
    set: (rules: BlacklistRule[]): Promise<void> => invoke('blacklistRules:set', rules),
  },
  skipKeywords: {
    get: (): Promise<string[]> => invoke('skipKeywords:get'),
    set: (keywords: string[]): Promise<void> => invoke('skipKeywords:set', keywords),
  },
  statusRules: {
    get: (): Promise<StatusRule[]> => invoke('statusRules:get'),
    set: (rules: StatusRule[]): Promise<void> => invoke('statusRules:set', rules),
    reset: (): Promise<StatusRule[]> => invoke('statusRules:reset'),
  },
  license: {
    get: (): Promise<LicenseState> => invoke('license:get'),
    activate: (input: LicenseActivationInput): Promise<LicenseState> => invoke('license:activate', input),
    refresh: (): Promise<LicenseState> => invoke('license:refresh'),
    clear: (): Promise<LicenseState> => invoke('license:clear'),
  },
  app: {
    version: (): Promise<string> => invoke('app:version'),
  },
};

export type ExtensionApi = typeof extensionApi;
