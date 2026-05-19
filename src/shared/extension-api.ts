import type {
  Account,
  BlacklistRule,
  Config,
  DraftProduct,
  GlobalScheduledTask,
  LogEntry,
  Order,
  OrderAddressInfo,
  OrderSearchParams,
  OrderStatus,
  ProductSourceBinding,
  ProductSourceItem,
  QuotaResult,
  ScheduledTask,
  StatusRule,
  TaskConfig,
  TaskCycleResult,
  ViolationMatch,
  ViolationScanResult,
} from './types';
import type { GlobalLogEntry } from './global-log';

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const response = await chrome.runtime.sendMessage({ channel, args }) as { ok?: boolean; result?: unknown; error?: string };
  if (!response?.ok) {
    throw new Error(response?.error || `Runtime request failed: ${channel}`);
  }
  return response.result as T;
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
    list: (accountId: string, status?: OrderStatus, pageSize?: number): Promise<{ orders: Order[]; hasMore: boolean }> => invoke('orders:list', accountId, status, pageSize),
    detail: (accountId: string, orderId: string): Promise<Order> => invoke('orders:detail', accountId, orderId),
    search: (accountId: string, params: OrderSearchParams): Promise<{ orders: Order[]; hasMore: boolean }> => invoke('orders:search', accountId, params),
    decodeAddress: (accountId: string, orderId: string): Promise<OrderAddressInfo> => invoke('orders:decodeAddress', accountId, orderId),
  },
  productSources: {
    list: (accountId: string): Promise<ProductSourceBinding[]> => invoke('productSources:list', accountId),
    set: (accountId: string, productId: string, sources: ProductSourceItem[]): Promise<ProductSourceBinding> => invoke('productSources:set', accountId, productId, sources),
    remove: (accountId: string, productId: string, sourceId: string): Promise<ProductSourceBinding> => invoke('productSources:remove', accountId, productId, sourceId),
  },
  quota: {
    get: (accountId: string): Promise<QuotaResult> => invoke('quota:get', accountId),
  },
  logs: {
    get: (accountId: string): Promise<LogEntry[]> => invoke('logs:get', accountId),
    clear: (accountId: string): Promise<void> => invoke('logs:clear', accountId),
  },
  globalLogs: {
    list: (): Promise<GlobalLogEntry[]> => invoke('globalLogs:list'),
    clear: (): Promise<void> => invoke('globalLogs:clear'),
    onAdded: (callback: (log: GlobalLogEntry) => void) => onRuntimeEvent('globalLog:added', callback),
  },
  scheduler: {
    list: (accountId: string): Promise<ScheduledTask[]> => invoke('scheduler:list', accountId),
    add: (accountId: string, task: Omit<ScheduledTask, 'id' | 'lastRunDate' | 'todayListedCount'>): Promise<ScheduledTask> => invoke('scheduler:add', accountId, task),
    update: (accountId: string, taskId: string, patch: Partial<ScheduledTask>): Promise<void> => invoke('scheduler:update', accountId, taskId, patch),
    remove: (accountId: string, taskId: string): Promise<void> => invoke('scheduler:remove', accountId, taskId),
  },
  globalScheduler: {
    list: (): Promise<GlobalScheduledTask[]> => invoke('globalScheduler:list'),
    add: (task: Omit<GlobalScheduledTask, 'id' | 'accountStats'>): Promise<GlobalScheduledTask> => invoke('globalScheduler:add', task),
    update: (taskId: string, patch: Partial<GlobalScheduledTask>): Promise<void> => invoke('globalScheduler:update', taskId, patch),
    remove: (taskId: string): Promise<void> => invoke('globalScheduler:remove', taskId),
  },
  taskConfig: {
    get: (accountId: string): Promise<TaskConfig> => invoke('taskConfig:get', accountId),
    set: (accountId: string, config: TaskConfig): Promise<void> => invoke('taskConfig:set', accountId, config),
  },
  task: {
    run: (accountId: string, config: TaskConfig): Promise<TaskCycleResult> => invoke('task:run', accountId, config),
    stop: (accountId: string): Promise<void> => invoke('task:stop', accountId),
    onLog: (accountId: string, callback: (log: LogEntry) => void) => onRuntimeEvent(`log:added:${accountId}`, callback),
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
    onLog: (accountId: string, callback: (log: LogEntry) => void) => onRuntimeEvent(`violation:log:${accountId}`, callback),
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
  app: {
    version: (): Promise<string> => invoke('app:version'),
  },
};

export type ExtensionApi = typeof extensionApi;
