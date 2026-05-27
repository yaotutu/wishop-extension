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

type AccountRefreshTaskResult =
  | { status: 'fulfilled'; value: AccountRefreshResult }
  | { status: 'rejected'; account: Account; error: string };

const ORDER_REFRESH_ACCOUNT_CONCURRENCY = 10;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultModeForReason(reason: NonNullable<RefreshOptions['reason']>): NonNullable<RefreshOptions['mode']> {
  if (reason === 'autoSync') return 'incremental';
  if (reason === 'historyBackfill') return 'backfill';
  return 'full';
}

function refreshStatus(successCount: number, failureCount: number): OrderRefreshResult['status'] {
  if (failureCount === 0) return 'completed';
  return successCount === 0 ? 'failed' : 'partial_failed';
}

async function runWithConcurrency<T, TResult>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

export function createOrderSyncService(deps: OrderSyncServiceDeps) {
  const now = deps.now || Date.now;

  async function resolveAccounts(scope: OrderScope): Promise<Account[]> {
    const accounts = await deps.getAccounts();
    if (scope.type === 'all') return accounts;
    return accounts.filter(account => account.id === scope.accountId);
  }

  async function refreshAccountOrders(account: Account, options: Required<Pick<RefreshOptions, 'reason' | 'mode'>> & Omit<RefreshOptions, 'reason' | 'mode'>): Promise<Order[]> {
    const source = options.reason;
    const fallbackStatuses = source !== 'autoSync';
    const logger = createLogger('OrderSync', account.id);
    logger.info('账号订单刷新开始', {
      accountName: account.name,
      source,
      mode: options.mode,
      fallbackStatuses,
    });
    return deps.source.fetchRecentOrders(account.id, {
      mode: options.mode,
      fallbackStatuses,
      debug: source === 'manualRefresh',
      windowStartTime: options.windowStartTime,
      windowEndTime: options.windowEndTime,
      lookbackDays: options.lookbackDays,
      maxWindows: options.maxWindows,
    });
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

    let commitQueue = Promise.resolve();
    function enqueueCommit<T>(work: () => Promise<T>): Promise<T> {
      const run = commitQueue.then(work, work);
      commitQueue = run.then(() => undefined, () => undefined);
      return run;
    }

    const accountResults = await runWithConcurrency(accounts, ORDER_REFRESH_ACCOUNT_CONCURRENCY, async (account): Promise<AccountRefreshTaskResult> => {
      try {
        await enqueueCommit(() => deps.store.markSyncStarted({ type: 'account', accountId: account.id }));
        const orders = await refreshAccountOrders(account, { ...options, reason, mode });
        const upsertResult = await enqueueCommit(() => deps.store.upsertMany(account.id, account.name, orders, reason));
        const result: AccountRefreshResult = {
          account,
          orders,
          fetchedOrderCount: upsertResult.fetchedCount,
          changedOrderCount: upsertResult.changedCount,
        };
        createLogger('OrderSync', account.id).info('账号订单刷新完成', {
          accountName: account.name,
          fetchedOrderCount: result.fetchedOrderCount,
          changedOrderCount: result.changedOrderCount,
          source: reason,
          mode,
        });
        await enqueueCommit(() => deps.store.markSyncFinished({ type: 'account', accountId: account.id }, {
          status: 'completed',
          scope: { type: 'account', accountId: account.id },
          refreshedAccountIds: [account.id],
          failedAccounts: [],
          fetchedOrderCount: result.fetchedOrderCount,
          updatedOrderCount: result.changedOrderCount,
          startedAt,
          finishedAt: now(),
        }));
        return { status: 'fulfilled', value: result };
      } catch (error) {
        const message = errorMessage(error);
        createLogger('OrderSync', account.id).error('账号订单刷新失败', {
          accountName: account.name,
          source: reason,
          error: message,
        });
        await enqueueCommit(() => deps.store.markSyncFinished({ type: 'account', accountId: account.id }, {
          status: 'failed',
          scope: { type: 'account', accountId: account.id },
          refreshedAccountIds: [],
          failedAccounts: [{ accountId: account.id, accountName: account.name, error: message }],
          fetchedOrderCount: 0,
          updatedOrderCount: 0,
          startedAt,
          finishedAt: now(),
        }));
        return { status: 'rejected', account, error: message };
      }
    });

    for (const accountResult of accountResults) {
      if (accountResult.status === 'fulfilled') {
        const result = accountResult.value;
        refreshedAccountIds.push(result.account.id);
        fetchedOrderCount += result.fetchedOrderCount;
        updatedOrderCount += result.changedOrderCount;
      } else {
        failedAccounts.push({
          accountId: accountResult.account.id,
          accountName: accountResult.account.name,
          error: accountResult.error,
        });
      }
    }

    const result: OrderRefreshResult = {
      status: refreshStatus(refreshedAccountIds.length, failedAccounts.length),
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
