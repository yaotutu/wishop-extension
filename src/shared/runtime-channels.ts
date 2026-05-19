import type { GlobalLogEntry } from './global-log';
import type {
  Account,
  BlacklistRule,
  Config,
  CreateShippingSessionInput,
  DraftProduct,
  GlobalScheduledTask,
  LicenseActivationInput,
  LicenseState,
  LogEntry,
  Order,
  OrderAddressInfo,
  OrderSearchParams,
  OrderStatus,
  ProductSourceBinding,
  ProductSourceItem,
  QuotaResult,
  ScheduledTask,
  ShippingSession,
  StatusRule,
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
    args: [accountId: string, status?: OrderStatus, pageSize?: number, reset?: boolean];
    result: { orders: Order[]; hasMore: boolean };
  };
  'orders:detail': { args: [accountId: string, orderId: string]; result: Order };
  'orders:search': { args: [accountId: string, params: OrderSearchParams]; result: { orders: Order[]; hasMore: boolean } };
  'orders:decodeAddress': { args: [accountId: string, orderId: string]; result: OrderAddressInfo };

  'productSources:list': { args: [accountId: string]; result: ProductSourceBinding[] };
  'productSources:set': { args: [accountId: string, productId: string, sources: ProductSourceItem[]]; result: ProductSourceBinding };
  'productSources:remove': { args: [accountId: string, productId: string, sourceId: string]; result: ProductSourceBinding };

  'shipping:open': { args: [input: CreateShippingSessionInput]; result: ShippingSession };
  'shipping:getCurrentTabSession': { args: []; result: ShippingSession | null };
  'shipping:markPageReady': { args: [sessionId: string]; result: ShippingSession };
  'shipping:complete': { args: [sessionId: string]; result: ShippingSession };
  'shipping:fail': { args: [sessionId: string, error: string]; result: ShippingSession };

  'quota:get': { args: [accountId: string]; result: QuotaResult };

  'logs:get': { args: [accountId: string]; result: LogEntry[] };
  'logs:clear': { args: [accountId: string]; result: void };
  'globalLogs:list': { args: []; result: GlobalLogEntry[] };
  'globalLogs:clear': { args: []; result: void };

  'scheduler:list': { args: [accountId: string]; result: ScheduledTask[] };
  'scheduler:add': { args: [accountId: string, task: Omit<ScheduledTask, 'id' | 'lastRunDate' | 'todayListedCount'>]; result: ScheduledTask };
  'scheduler:update': { args: [accountId: string, taskId: string, patch: Partial<ScheduledTask>]; result: void };
  'scheduler:remove': { args: [accountId: string, taskId: string]; result: void };

  'globalScheduler:list': { args: []; result: GlobalScheduledTask[] };
  'globalScheduler:add': { args: [task: Omit<GlobalScheduledTask, 'id' | 'accountStats'>]; result: GlobalScheduledTask };
  'globalScheduler:update': { args: [taskId: string, patch: Partial<GlobalScheduledTask>]; result: void };
  'globalScheduler:remove': { args: [taskId: string]; result: void };

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
