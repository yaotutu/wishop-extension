/**
 * 前端 IPC SDK 入口。
 *
 * 「复制商品」业务域下，extensionApi 只暴露 productCopy / productSources / products /
 * accounts / config / wxCategoryData / activityLogs / notifications / settings /
 * taobaoWorkspace / taobaoLogin / app 这几组方法。
 *
 * 历史上还有 orders / drafts / shipping / purchaseLookup / taobaoRefund / quota /
 * productAudit / scheduledJobs / violationWords / license 域，已经随业务一起删除。
 */
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
  ProductSourceBinding,
  ProductSourceItem,
  ProductQrcodeResult,
  ProductCopySession,
  TaobaoProductSnapshot,
  TaobaoSecurityChallengeSnapshot,
  TaobaoLoginSnapshot,
  TaobaoWorkspaceRole,
  SyncWxCategoryProductRulesInput,
  SyncWxCategoryProductRulesResult,
  WxDraftBoxProductPrepareResult,
  WxProductDraftSuggestionResult,
  WxProductDraftCreationResult,
  WxCategoryProductRuleCacheStatus,
} from './types';
import type { ActivityLogEntry } from './activity-log';
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
  console.warn(`[dianxiaoqi] ${errorMessage}。开发环境检测到前后台版本不一致，正在自动重新加载插件。`);
  window.setTimeout(() => {
    try {
      const runtime = chrome.runtime as typeof chrome.runtime & { reload?: () => void };
      runtime.reload?.();
    } catch (error) {
      console.warn('[dianxiaoqi] 自动重新加载插件失败，请手动在 chrome://extensions 重新加载。', error);
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
  productSources: {
    list: (accountId: string): Promise<ProductSourceBinding[]> => invoke('productSources:list', accountId),
    set: (accountId: string, productId: string, sources: ProductSourceItem[]): Promise<ProductSourceBinding> => invoke('productSources:set', accountId, productId, sources),
    remove: (accountId: string, productId: string, sourceId: string): Promise<ProductSourceBinding> => invoke('productSources:remove', accountId, productId, sourceId),
  },
  products: {
    getQrcode: (accountId: string, productId: string): Promise<ProductQrcodeResult> => invoke('products:getQrcode', accountId, productId),
  },
  productCopy: {
    list: (): Promise<ProductCopyRecord[]> => invoke('productCopy:list'),
    remove: (copyId: string): Promise<void> => invoke('productCopy:remove', copyId),
    getDraftParameterOptions: (accountId: string): Promise<ProductCopyDraftParameterOptions> =>
      invoke('productCopy:getDraftParameterOptions', accountId),
    getCreatedProduct: (accountId: string, copyId: string): Promise<ProductCopyCreatedProductRecord | null> =>
      invoke('productCopy:getCreatedProduct', accountId, copyId),
    getDefaultSettings: (accountId: string): Promise<ProductCopyDefaultSettings> =>
      invoke('productCopy:getDefaultSettings', accountId),
    saveDefaultSettings: (accountId: string, patch: ProductCopyDefaultSettingsPatch): Promise<ProductCopyDefaultSettings> =>
      invoke('productCopy:saveDefaultSettings', accountId, patch),
    open: (input: CreateProductCopySessionInput): Promise<ProductCopySession> =>
      invoke('productCopy:open', input),
    getCurrentTabSession: (): Promise<ProductCopySession | null> =>
      invoke('productCopy:getCurrentTabSession'),
    markPageReady: (sessionId: string): Promise<ProductCopySession> =>
      invoke('productCopy:markPageReady', sessionId),
    reportChallenge: (
      sessionId: string,
      snapshot: TaobaoSecurityChallengeSnapshot,
    ): Promise<ProductCopySession> => invoke('productCopy:reportChallenge', sessionId, snapshot),
    resolveChallenge: (sessionId: string): Promise<ProductCopySession> =>
      invoke('productCopy:resolveChallenge', sessionId),
    complete: (sessionId: string, snapshot: TaobaoProductSnapshot): Promise<ProductCopyRecord> =>
      invoke('productCopy:complete', sessionId, snapshot),
    fail: (sessionId: string, error: string): Promise<ProductCopySession> =>
      invoke('productCopy:fail', sessionId, error),
    suggestWxCategoryFromFullList: (input: CreateWxProductDraftSuggestionInput): Promise<WxProductDraftSuggestionResult> =>
      invoke('productCopy:suggestWxCategoryFromFullList', input),
    prepareWxDraftBoxProduct: (input: CreateWxDraftBoxProductPrepareInput): Promise<WxDraftBoxProductPrepareResult> =>
      invoke('productCopy:prepareWxDraftBoxProduct', input),
    createPreparedWxDraftBoxProduct: (input: CreatePreparedWxDraftBoxProductInput): Promise<WxProductDraftCreationResult> =>
      invoke('productCopy:createPreparedWxDraftBoxProduct', input),
    createWxDraftBoxProduct: (input: CreateWxDraftBoxProductInput): Promise<WxProductDraftCreationResult> =>
      invoke('productCopy:createWxDraftBoxProduct', input),
    deleteCreatedWxDraftBoxProduct: (input: DeleteCreatedWxDraftBoxProductInput): Promise<DeleteCreatedWxDraftBoxProductResult> =>
      invoke('productCopy:deleteCreatedWxDraftBoxProduct', input),
    onCompleted: (callback: (listing: ProductCopyRecord) => void) =>
      onRuntimeEvent('productCopy:completed', callback),
    onFailed: (callback: (payload: { url: string; error: string }) => void) =>
      onRuntimeEvent('productCopy:failed', callback),
    onChallenge: (callback: (payload: { url: string; reason: string }) => void) =>
      onRuntimeEvent('productCopy:challenge', callback),
  },
  wxCategoryData: {
    downloadProductRules: (input: SyncWxCategoryProductRulesInput): Promise<SyncWxCategoryProductRulesResult> =>
      invoke('wxCategoryData:downloadProductRules', input),
    getProductRuleCacheStatus: (): Promise<WxCategoryProductRuleCacheStatus> =>
      invoke('wxCategoryData:getProductRuleCacheStatus'),
  },
  taobaoWorkspace: {
    getCurrentRole: (): Promise<TaobaoWorkspaceRole | null> => invoke('taobaoWorkspace:getCurrentRole'),
  },
  /** 淘宝登录态：读取后台内存态快照、触发即时探测、content 主动回报，并订阅状态变化事件。 */
  taobaoLogin: {
    getState: (): Promise<TaobaoLoginSnapshot> => invoke('taobaoLogin:getState'),
    probeNow: (): Promise<TaobaoLoginSnapshot> => invoke('taobaoLogin:probeNow'),
    reportFromContent: (snapshot: TaobaoLoginSnapshot): Promise<void> => invoke('taobaoLogin:reportFromContent', snapshot),
    openLoginPage: (): Promise<void> => invoke('taobaoLogin:openLoginPage'),
    onLoginChanged: (callback: (snapshot: TaobaoLoginSnapshot) => void) =>
      onRuntimeEvent('taobaoLogin:changed', callback),
  },
  activityLogs: {
    list: (): Promise<ActivityLogEntry[]> => invoke('activityLogs:list'),
    clear: (): Promise<void> => invoke('activityLogs:clear'),
    onAdded: (callback: (log: ActivityLogEntry) => void) => onRuntimeEvent('activityLog:added', callback),
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
  app: {
    version: (): Promise<string> => invoke('app:version'),
  },
};
