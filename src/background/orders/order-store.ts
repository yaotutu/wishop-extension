import type {
  LocalOrderListResult,
  Order,
  OrderListFilters,
  OrderRefreshResult,
  OrderScope,
  OrderSearchParams,
  OrderSyncAccountState,
  OrderSyncState,
  StoredOrderSnapshot,
  StoredOrderSource,
} from '../../shared/types';
import { buildOrderIndexedText, orderMatchesSearch } from './order-index.ts';

const ORDER_SNAPSHOTS_KEY = 'orderSnapshots';
const ORDER_SYNC_STATES_KEY = 'orderSyncStates';
const DEFAULT_MAX_ORDERS_PER_ACCOUNT = 500;

export interface OrderStoreStorage {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(patch: Record<string, unknown>): Promise<void>;
}

export interface OrderStoreOptions {
  maxOrdersPerAccount?: number;
  now?: () => number;
}

interface StoredOrderState {
  snapshots: StoredOrderSnapshot[];
  syncStates: Record<string, OrderSyncAccountState>;
}

function defaultStorage(): OrderStoreStorage {
  return {
    get: keys => chrome.storage.local.get(keys),
    set: patch => chrome.storage.local.set(patch),
  };
}

function scopeKey(scope: OrderScope): string {
  return scope.type === 'account' ? `account:${scope.accountId}` : 'all';
}

function sortSnapshots(snapshots: StoredOrderSnapshot[]): StoredOrderSnapshot[] {
  return [...snapshots].sort((a, b) => (
    (b.order.update_time || 0) - (a.order.update_time || 0)
    || (b.order.create_time || 0) - (a.order.create_time || 0)
    || b.lastFetchedAt - a.lastFetchedAt
  ));
}

function matchesScope(snapshot: StoredOrderSnapshot, scope: OrderScope): boolean {
  return scope.type === 'all' || snapshot.accountId === scope.accountId;
}

function minCreateTime(filters: OrderListFilters): number | null {
  const scope = filters.timeScope || 'all';
  if (scope === 'all') return null;
  const days = Number(scope.replace('d', ''));
  if (!Number.isFinite(days)) return null;
  const nowSeconds = filters.nowSeconds ?? Math.floor(Date.now() / 1000);
  return nowSeconds - days * 24 * 60 * 60;
}

function matchesFilters(snapshot: StoredOrderSnapshot, filters: OrderListFilters): boolean {
  if (filters.status !== undefined && snapshot.order.status !== filters.status) return false;
  const minTime = minCreateTime(filters);
  if (minTime !== null && snapshot.order.create_time < minTime) return false;
  if (filters.search?.keyword?.trim() && !orderMatchesSearch(snapshot.order, snapshot.indexedText, filters.search)) return false;
  return true;
}

function paginate(snapshots: StoredOrderSnapshot[], filters: OrderListFilters): LocalOrderListResult {
  const pageSize = Math.max(1, filters.pageSize || snapshots.length || DEFAULT_MAX_ORDERS_PER_ACCOUNT);
  const start = Math.max(0, Number(filters.cursor || 0) || 0);
  const end = start + pageSize;
  const page = snapshots.slice(start, end);
  return {
    orders: page,
    hasMore: end < snapshots.length,
    nextCursor: end < snapshots.length ? String(end) : undefined,
  };
}

function prunePerAccount(snapshots: StoredOrderSnapshot[], maxOrdersPerAccount: number): StoredOrderSnapshot[] {
  const grouped = new Map<string, StoredOrderSnapshot[]>();
  for (const snapshot of snapshots) {
    grouped.set(snapshot.accountId, [...(grouped.get(snapshot.accountId) || []), snapshot]);
  }
  return [...grouped.values()].flatMap(items => sortSnapshots(items).slice(0, maxOrdersPerAccount));
}

export function createOrderStore(storage: OrderStoreStorage = defaultStorage(), options: OrderStoreOptions = {}) {
  const maxOrdersPerAccount = options.maxOrdersPerAccount || DEFAULT_MAX_ORDERS_PER_ACCOUNT;
  const now = options.now || Date.now;

  async function readState(): Promise<StoredOrderState> {
    const data = await storage.get([ORDER_SNAPSHOTS_KEY, ORDER_SYNC_STATES_KEY]);
    return {
      snapshots: Array.isArray(data[ORDER_SNAPSHOTS_KEY]) ? data[ORDER_SNAPSHOTS_KEY] as StoredOrderSnapshot[] : [],
      syncStates: typeof data[ORDER_SYNC_STATES_KEY] === 'object' && data[ORDER_SYNC_STATES_KEY] !== null
        ? data[ORDER_SYNC_STATES_KEY] as Record<string, OrderSyncAccountState>
        : {},
    };
  }

  async function writeState(patch: Partial<StoredOrderState>): Promise<void> {
    const data: Record<string, unknown> = {};
    if (patch.snapshots) data[ORDER_SNAPSHOTS_KEY] = patch.snapshots;
    if (patch.syncStates) data[ORDER_SYNC_STATES_KEY] = patch.syncStates;
    await storage.set(data);
  }

  async function upsertMany(
    accountId: string,
    accountName: string,
    orders: Order[],
    source: StoredOrderSource,
  ): Promise<StoredOrderSnapshot[]> {
    const state = await readState();
    const currentByKey = new Map(state.snapshots.map(snapshot => [`${snapshot.accountId}:${snapshot.orderId}`, snapshot]));
    const fetchedAt = now();

    for (const order of orders) {
      const orderId = String(order.order_id || '').trim();
      if (!orderId) continue;
      const key = `${accountId}:${orderId}`;
      const previous = currentByKey.get(key);
      const changed = !previous
        || previous.order.status !== order.status
        || previous.order.update_time !== order.update_time
        || previous.indexedText !== buildOrderIndexedText(order);
      currentByKey.set(key, {
        accountId,
        accountName,
        orderId,
        order,
        indexedText: buildOrderIndexedText(order),
        lastFetchedAt: fetchedAt,
        lastChangedAt: changed ? fetchedAt : previous.lastChangedAt,
        source,
      });
    }

    const snapshots = prunePerAccount([...currentByKey.values()], maxOrdersPerAccount);
    await writeState({ snapshots });
    return snapshots.filter(snapshot => snapshot.accountId === accountId);
  }

  async function list(scope: OrderScope, filters: OrderListFilters = {}): Promise<LocalOrderListResult> {
    const state = await readState();
    const snapshots = sortSnapshots(state.snapshots)
      .filter(snapshot => matchesScope(snapshot, scope))
      .filter(snapshot => matchesFilters(snapshot, filters));
    return paginate(snapshots, filters);
  }

  async function search(scope: OrderScope, params: OrderSearchParams): Promise<LocalOrderListResult> {
    return list(scope, { search: params, pageSize: params.page_size });
  }

  async function get(accountId: string, orderId: string): Promise<StoredOrderSnapshot | null> {
    const state = await readState();
    return state.snapshots.find(snapshot => snapshot.accountId === accountId && snapshot.orderId === orderId) || null;
  }

  async function markSyncStarted(scope: OrderScope): Promise<void> {
    const state = await readState();
    const startedAt = now();
    const key = scopeKey(scope);
    state.syncStates[key] = {
      ...state.syncStates[key],
      accountId: scope.type === 'account' ? scope.accountId : key,
      running: true,
      lastStartedAt: startedAt,
      lastError: '',
    };
    await writeState({ syncStates: state.syncStates });
  }

  async function markSyncFinished(scope: OrderScope, result: OrderRefreshResult): Promise<void> {
    const state = await readState();
    const key = scopeKey(scope);
    state.syncStates[key] = {
      ...state.syncStates[key],
      accountId: scope.type === 'account' ? scope.accountId : key,
      running: false,
      lastFinishedAt: result.finishedAt,
      lastSuccessAt: result.failedAccounts.length === 0 ? result.finishedAt : state.syncStates[key]?.lastSuccessAt,
      lastError: result.failedAccounts.map(item => `${item.accountName || item.accountId}: ${item.error}`).join('; '),
      nextSyncAt: result.finishedAt + 60_000,
    };
    await writeState({ syncStates: state.syncStates });
  }

  async function getSyncState(scope: OrderScope): Promise<OrderSyncState> {
    const state = await readState();
    const direct = state.syncStates[scopeKey(scope)];
    const accountStates = Object.entries(state.syncStates)
      .filter(([key]) => key.startsWith('account:'))
      .map(([, value]) => value);
    return {
      scope,
      running: direct?.running || accountStates.some(item => item.running),
      lastStartedAt: direct?.lastStartedAt,
      lastFinishedAt: direct?.lastFinishedAt,
      lastSuccessAt: direct?.lastSuccessAt,
      lastError: direct?.lastError,
      nextSyncAt: direct?.nextSyncAt,
      accountStates: scope.type === 'account'
        ? accountStates.filter(item => item.accountId === scope.accountId)
        : accountStates,
    };
  }

  return {
    upsertMany,
    list,
    search,
    get,
    markSyncStarted,
    markSyncFinished,
    getSyncState,
  };
}

export type OrderStore = ReturnType<typeof createOrderStore>;
export const orderStore = createOrderStore();
