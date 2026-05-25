import type {
  Account,
  Order,
  OrderRefreshResult,
  OrderScope,
  OrderSearchParams,
  StoredOrderSource,
} from '../../shared/types';
import { createLogger } from '../utils/logger.ts';
import type { OrderStore } from './order-store.ts';
import type { WxOrderSource } from './wx-order-source.ts';

export interface OrderSyncServiceDeps {
  store: OrderStore;
  source: WxOrderSource;
  getAccounts: () => Promise<Account[]>;
  now?: () => number;
}

export interface RefreshOptions {
  reason?: Extract<StoredOrderSource, 'autoSync' | 'manualRefresh' | 'historyBackfill'>;
  mode?: 'incremental' | 'full' | 'backfill';
  windowStartTime?: number;
  windowEndTime?: number;
  lookbackDays?: number;
  maxWindows?: number;
}

interface AccountRefreshResult {
  account: Account;
  orders: Order[];
  fetchedOrderCount: number;
  changedOrderCount: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatFailedAccounts(failedAccounts: OrderRefreshResult['failedAccounts']): string {
  return failedAccounts
    .map(item => `${item.accountName || item.accountId}: ${item.error}`)
    .join('; ');
}

function defaultModeForReason(reason: NonNullable<RefreshOptions['reason']>): NonNullable<RefreshOptions['mode']> {
  if (reason === 'autoSync') return 'incremental';
  if (reason === 'historyBackfill') return 'backfill';
  return 'full';
}

export function createOrderSyncService(deps: OrderSyncServiceDeps) {
  const now = deps.now || Date.now;
  const inFlightRefreshes = new Map<string, Promise<AccountRefreshResult>>();

  async function resolveAccounts(scope: OrderScope): Promise<Account[]> {
    const accounts = await deps.getAccounts();
    if (scope.type === 'all') return accounts;
    return accounts.filter(account => account.id === scope.accountId);
  }

  async function refreshAccount(account: Account, options: Required<Pick<RefreshOptions, 'reason' | 'mode'>> & Omit<RefreshOptions, 'reason' | 'mode'>): Promise<AccountRefreshResult> {
    const existing = inFlightRefreshes.get(account.id);
    if (existing) return existing;
    const promise = (async () => {
      const source = options.reason;
      const fallbackStatuses = source !== 'autoSync';
      const logger = createLogger('OrderSync', account.id);
      logger.info('账号订单刷新开始', {
        accountName: account.name,
        source,
        mode: options.mode,
        fallbackStatuses,
      });
      await deps.store.markSyncStarted({ type: 'account', accountId: account.id });
      const orders = await deps.source.fetchRecentOrders(account.id, {
        mode: options.mode,
        fallbackStatuses,
        debug: source === 'manualRefresh',
        windowStartTime: options.windowStartTime,
        windowEndTime: options.windowEndTime,
        lookbackDays: options.lookbackDays,
        maxWindows: options.maxWindows,
      });
      const upsertResult = await deps.store.upsertMany(account.id, account.name, orders, source);
      logger.info('账号订单刷新完成', {
        accountName: account.name,
        fetchedOrderCount: upsertResult.fetchedCount,
        changedOrderCount: upsertResult.changedCount,
        source,
        mode: options.mode,
      });
      return {
        account,
        orders,
        fetchedOrderCount: upsertResult.fetchedCount,
        changedOrderCount: upsertResult.changedCount,
      };
    })();
    inFlightRefreshes.set(account.id, promise);
    try {
      return await promise;
    } finally {
      inFlightRefreshes.delete(account.id);
    }
  }

  async function refresh(scope: OrderScope, options: RefreshOptions = {}): Promise<OrderRefreshResult> {
    const reason = options.reason || 'manualRefresh';
    const mode = options.mode || defaultModeForReason(reason);
    const startedAt = now();
    const logger = createLogger('OrderSync');
    await deps.store.markSyncStarted(scope);
    const accounts = await resolveAccounts(scope);
    logger.info('订单刷新任务开始', {
      scope,
      reason,
      mode,
      accountCount: accounts.length,
    });
    const refreshedAccountIds: string[] = [];
    const failedAccounts: OrderRefreshResult['failedAccounts'] = [];
    let fetchedOrderCount = 0;
    let updatedOrderCount = 0;

    for (const account of accounts) {
      try {
        const result = await refreshAccount(account, { ...options, reason, mode });
        refreshedAccountIds.push(account.id);
        fetchedOrderCount += result.fetchedOrderCount;
        updatedOrderCount += result.changedOrderCount;
        await deps.store.markSyncFinished({ type: 'account', accountId: account.id }, {
          scope: { type: 'account', accountId: account.id },
          refreshedAccountIds: [account.id],
          failedAccounts: [],
          fetchedOrderCount: result.fetchedOrderCount,
          updatedOrderCount: result.changedOrderCount,
          startedAt,
          finishedAt: now(),
        });
      } catch (error) {
        const message = errorMessage(error);
        createLogger('OrderSync', account.id).error('账号订单刷新失败', {
          accountName: account.name,
          source: reason,
          error: message,
        });
        failedAccounts.push({ accountId: account.id, accountName: account.name, error: message });
        await deps.store.markSyncFinished({ type: 'account', accountId: account.id }, {
          scope: { type: 'account', accountId: account.id },
          refreshedAccountIds: [],
          failedAccounts: [{ accountId: account.id, accountName: account.name, error: message }],
          fetchedOrderCount: 0,
          updatedOrderCount: 0,
          startedAt,
          finishedAt: now(),
        });
      }
    }

    const result: OrderRefreshResult = {
      scope,
      refreshedAccountIds,
      failedAccounts,
      fetchedOrderCount,
      updatedOrderCount,
      startedAt,
      finishedAt: now(),
    };
    await deps.store.markSyncFinished(scope, result);
    logger.info('订单刷新任务结束', {
      scope,
      reason,
      refreshedAccountCount: refreshedAccountIds.length,
      failedAccountCount: failedAccounts.length,
      fetchedOrderCount,
      updatedOrderCount,
    });
    if (accounts.length === 0) {
      throw new Error(scope.type === 'account' ? `账号不存在: ${scope.accountId}` : '当前没有可刷新的账号');
    }
    if (failedAccounts.length === accounts.length) {
      throw new Error(formatFailedAccounts(failedAccounts));
    }
    return result;
  }

  async function searchRemote(scope: OrderScope, params: OrderSearchParams) {
    const accounts = await resolveAccounts(scope);
    const failures: string[] = [];
    for (const account of accounts) {
      try {
        const orders = await deps.source.searchOrders(account.id, params);
        await deps.store.upsertMany(account.id, account.name, orders, 'remoteSearch');
      } catch (error) {
        failures.push(`${account.name}: ${errorMessage(error)}`);
      }
    }
    if (failures.length === accounts.length && failures.length > 0) {
      throw new Error(failures.join('; '));
    }
    return deps.store.search(scope, params);
  }

  async function refreshDetail(accountId: string, orderId: string): Promise<Order> {
    const accounts = await deps.getAccounts();
    const account = accounts.find(item => item.id === accountId);
    if (!account) throw new Error(`账号不存在: ${accountId}`);
    const order = await deps.source.getOrderDetail(accountId, orderId);
    await deps.store.upsertMany(account.id, account.name, [order], 'detailRefresh');
    return order;
  }

  return {
    refresh,
    searchRemote,
    refreshDetail,
  };
}

export type OrderSyncService = ReturnType<typeof createOrderSyncService>;
