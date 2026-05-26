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
import { extensionDb, type OrderRecord } from '../db/extension-db.ts';
import { markAccountDirty } from '../store/account-sync-state-repository.ts';
import { updateAccountWorkspace } from '../store/workspace-repository.ts';
import { buildOrderIndexedText, orderMatchesSearch } from './order-index.ts';

const ORDER_SNAPSHOTS_KEY = 'orderSnapshots';
const ORDER_SYNC_STATES_KEY = 'orderSyncStates';
const ORDER_SYNC_WORKSPACE_ID = '__order_sync__';
const DEFAULT_ORDER_PAGE_SIZE = 50;

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

export interface OrderUpsertResult {
  snapshots: StoredOrderSnapshot[];
  fetchedCount: number;
  changedCount: number;
}

function orderRecordToSnapshot(record: OrderRecord): StoredOrderSnapshot {
  return {
    accountId: record.accountId,
    accountName: record.accountName,
    orderId: record.orderId,
    order: record.order,
    indexedText: record.indexedText,
    lastFetchedAt: record.lastFetchedAt,
    lastChangedAt: record.lastChangedAt,
    source: record.source,
  };
}

function orderToRecord(
  accountId: string,
  accountName: string,
  order: Order,
  source: StoredOrderSource,
  fetchedAt: number,
  changed: boolean,
  previous?: OrderRecord,
): OrderRecord {
  const orderId = String(order.order_id || '').trim();
  return {
    accountId,
    accountName,
    orderId,
    status: order.status,
    createTime: order.create_time || 0,
    updateTime: order.update_time || 0,
    indexedText: buildOrderIndexedText(order),
    order,
    source,
    lastFetchedAt: fetchedAt,
    lastChangedAt: changed ? fetchedAt : previous?.lastChangedAt || fetchedAt,
  };
}

async function readOrderSyncStates(): Promise<Record<string, OrderSyncAccountState>> {
  const workspaces = await extensionDb.accountWorkspaces.toArray();
  return Object.assign({}, ...workspaces.map(workspace => workspace.orderSyncStates || {}));
}

async function writeOrderSyncStates(syncStates: Record<string, OrderSyncAccountState>): Promise<void> {
  const workspaces = await extensionDb.accountWorkspaces.toArray();
  await Promise.all(workspaces
    .filter(workspace => Object.keys(workspace.orderSyncStates || {}).length > 0)
    .map(workspace => updateAccountWorkspace(workspace.accountId, current => {
      current.orderSyncStates = {};
    })));

  const grouped = new Map<string, Record<string, OrderSyncAccountState>>();
  for (const [key, state] of Object.entries(syncStates)) {
    const workspaceId = key.startsWith('account:')
      ? key.slice('account:'.length)
      : ORDER_SYNC_WORKSPACE_ID;
    grouped.set(workspaceId, {
      ...(grouped.get(workspaceId) || {}),
      [key]: state,
    });
  }

  await Promise.all([...grouped.entries()].map(([workspaceId, states]) => (
    updateAccountWorkspace(workspaceId, workspace => {
      workspace.orderSyncStates = states;
    })
  )));
}

function createIndexedDbOrderStore(options: OrderStoreOptions = {}) {
  const maxOrdersPerAccount = options.maxOrdersPerAccount;
  const now = options.now || Date.now;

  async function accountSnapshots(accountId: string): Promise<StoredOrderSnapshot[]> {
    return (await extensionDb.orders.where('accountId').equals(accountId).toArray()).map(orderRecordToSnapshot);
  }

  async function scopedRecords(scope: OrderScope): Promise<OrderRecord[]> {
    if (scope.type === 'account') {
      return extensionDb.orders.where('accountId').equals(scope.accountId).toArray();
    }
    return extensionDb.orders.toArray();
  }

  async function enforceAccountLimit(accountId: string): Promise<void> {
    if (!maxOrdersPerAccount || maxOrdersPerAccount <= 0) return;
    const records = await extensionDb.orders.where('accountId').equals(accountId).toArray();
    const sorted = sortSnapshots(records.map(orderRecordToSnapshot));
    const keep = new Set(sorted.slice(0, maxOrdersPerAccount).map(snapshot => snapshot.orderId));
    const deleteKeys = records
      .filter(record => !keep.has(record.orderId))
      .map(record => [record.accountId, record.orderId] as [string, string]);
    if (deleteKeys.length > 0) await extensionDb.orders.bulkDelete(deleteKeys);
  }

  async function upsertMany(
    accountId: string,
    accountName: string,
    orders: Order[],
    source: StoredOrderSource,
  ): Promise<OrderUpsertResult> {
    const fetchedAt = now();
    const nextRecords: OrderRecord[] = [];
    let fetchedCount = 0;
    let changedCount = 0;

    for (const order of orders) {
      const orderId = String(order.order_id || '').trim();
      if (!orderId) continue;
      fetchedCount += 1;
      const previous = await extensionDb.orders.get([accountId, orderId]);
      const indexedText = buildOrderIndexedText(order);
      const changed = !previous
        || previous.status !== order.status
        || previous.updateTime !== order.update_time
        || previous.indexedText !== indexedText;
      if (changed) changedCount += 1;
      nextRecords.push(orderToRecord(accountId, accountName, order, source, fetchedAt, changed, previous));
    }

    if (nextRecords.length > 0) {
      await extensionDb.orders.bulkPut(nextRecords);
      await enforceAccountLimit(accountId);
      await markAccountDirty(accountId);
    }

    return {
      snapshots: await accountSnapshots(accountId),
      fetchedCount,
      changedCount,
    };
  }

  async function list(scope: OrderScope, filters: OrderListFilters = {}): Promise<LocalOrderListResult> {
    const snapshots = sortSnapshots((await scopedRecords(scope)).map(orderRecordToSnapshot))
      .filter(snapshot => matchesFilters(snapshot, filters));
    return paginate(snapshots, filters);
  }

  async function search(scope: OrderScope, params: OrderSearchParams): Promise<LocalOrderListResult> {
    return list(scope, { search: params, pageSize: params.page_size });
  }

  async function get(accountId: string, orderId: string): Promise<StoredOrderSnapshot | null> {
    const record = await extensionDb.orders.get([accountId, orderId]);
    return record ? orderRecordToSnapshot(record) : null;
  }

  async function markSyncStarted(scope: OrderScope): Promise<void> {
    const syncStates = await readOrderSyncStates();
    const startedAt = now();
    const key = scopeKey(scope);
    syncStates[key] = {
      ...syncStates[key],
      accountId: scope.type === 'account' ? scope.accountId : key,
      running: true,
      lastStartedAt: startedAt,
      lastError: '',
    };
    await writeOrderSyncStates(syncStates);
  }

  async function markSyncFinished(scope: OrderScope, result: OrderRefreshResult): Promise<void> {
    const syncStates = await readOrderSyncStates();
    const key = scopeKey(scope);
    syncStates[key] = {
      ...syncStates[key],
      accountId: scope.type === 'account' ? scope.accountId : key,
      running: false,
      lastFinishedAt: result.finishedAt,
      lastSuccessAt: result.failedAccounts.length === 0 ? result.finishedAt : syncStates[key]?.lastSuccessAt,
      lastError: result.failedAccounts.map(item => `${item.accountName || item.accountId}: ${item.error}`).join('; '),
      nextSyncAt: result.finishedAt + 60_000,
    };
    await writeOrderSyncStates(syncStates);
  }

  async function getSyncState(scope: OrderScope): Promise<OrderSyncState> {
    const syncStates = await readOrderSyncStates();
    const direct = syncStates[scopeKey(scope)];
    const accountStates = Object.entries(syncStates)
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
  const pageSize = Math.max(1, filters.pageSize || snapshots.length || DEFAULT_ORDER_PAGE_SIZE);
  const start = Math.max(0, Number(filters.cursor || 0) || 0);
  const end = start + pageSize;
  const page = snapshots.slice(start, end);
  return {
    orders: page,
    hasMore: end < snapshots.length,
    total: snapshots.length,
    nextCursor: end < snapshots.length ? String(end) : undefined,
  };
}

function limitPerAccount(snapshots: StoredOrderSnapshot[], maxOrdersPerAccount?: number): StoredOrderSnapshot[] {
  if (!maxOrdersPerAccount || maxOrdersPerAccount <= 0) return snapshots;
  const grouped = new Map<string, StoredOrderSnapshot[]>();
  for (const snapshot of snapshots) {
    grouped.set(snapshot.accountId, [...(grouped.get(snapshot.accountId) || []), snapshot]);
  }
  return [...grouped.values()].flatMap(items => sortSnapshots(items).slice(0, maxOrdersPerAccount));
}

export function createOrderStore(storage?: OrderStoreStorage, options: OrderStoreOptions = {}) {
  if (!storage) return createIndexedDbOrderStore(options);

  const kvStorage = storage;
  const maxOrdersPerAccount = options.maxOrdersPerAccount;
  const now = options.now || Date.now;

  async function readState(): Promise<StoredOrderState> {
    const data = await kvStorage.get([ORDER_SNAPSHOTS_KEY, ORDER_SYNC_STATES_KEY]);
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
    await kvStorage.set(data);
  }

  async function upsertMany(
    accountId: string,
    accountName: string,
    orders: Order[],
    source: StoredOrderSource,
  ): Promise<OrderUpsertResult> {
    const state = await readState();
    const currentByKey = new Map(state.snapshots.map(snapshot => [`${snapshot.accountId}:${snapshot.orderId}`, snapshot]));
    const fetchedAt = now();
    let fetchedCount = 0;
    let changedCount = 0;

    for (const order of orders) {
      const orderId = String(order.order_id || '').trim();
      if (!orderId) continue;
      fetchedCount += 1;
      const key = `${accountId}:${orderId}`;
      const previous = currentByKey.get(key);
      const changed = !previous
        || previous.order.status !== order.status
        || previous.order.update_time !== order.update_time
        || previous.indexedText !== buildOrderIndexedText(order);
      if (changed) changedCount += 1;
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

    const snapshots = limitPerAccount([...currentByKey.values()], maxOrdersPerAccount);
    await writeState({ snapshots });
    return {
      snapshots: snapshots.filter(snapshot => snapshot.accountId === accountId),
      fetchedCount,
      changedCount,
    };
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
