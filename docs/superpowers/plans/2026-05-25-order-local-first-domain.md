# Order Local-First Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild order management so the dashboard reads local-first order snapshots, supports all-account views, and refreshes orders through a background order domain.

**Architecture:** Add shared order scope/query types, a background `OrderStore`, `WxOrderSource`, `OrderSyncService`, and `OrderDomainService`. Route order list/search/detail/refresh/sync-state IPC through the domain service, then update React order hooks and page scope handling to consume local-first data.

**Tech Stack:** WXT MV3 background service worker, React 19, TypeScript, Ant Design 6, TanStack Query 5, `chrome.storage.local`, `chrome.alarms` through the existing `ScheduledJob` center.

---

### Task 1: Shared Order Domain Types

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/runtime-channels.ts`
- Modify: `src/query/query-keys.ts`
- Test: `tests/order-domain-types.test.ts`

- [ ] **Step 1: Write the failing type/runtime test**

Create `tests/order-domain-types.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import type { OrderScope, OrderSearchSource, OrderSyncState } from '../src/shared/types.ts';
import { queryKeys } from '../src/query/query-keys.ts';

test('order query keys include scope and search source', () => {
  const allScope: OrderScope = { type: 'all' };
  const accountScope: OrderScope = { type: 'account', accountId: 'account-1' };
  const source: OrderSearchSource = 'remote';
  const state: OrderSyncState = { scope: allScope, running: false, accountStates: [] };

  assert.equal(state.scope.type, 'all');
  assert.deepEqual(queryKeys.orders.list(allScope, undefined, null, 'all'), ['orders', 'list', 'all', '', 'all', '', '']);
  assert.deepEqual(queryKeys.orders.search(accountScope, { search_type: 'order_id', keyword: '123' }, source), [
    'orders',
    'search',
    'account',
    'account-1',
    'remote',
    'order_id',
    '123',
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/order-domain-types.test.ts`

Expected: FAIL because `OrderScope`, `OrderSearchSource`, `OrderSyncState`, and new query key signatures do not exist.

- [ ] **Step 3: Implement shared types and query keys**

Add `OrderScope`, `OrderSearchSource`, `StoredOrderSnapshot`, `OrderListFilters`, `OrderListResult`, `OrderRefreshResult`, and `OrderSyncState` to `src/shared/types.ts`. Update `RuntimeChannels` so `orders:list`, `orders:search`, `orders:detail`, `orders:refresh`, and `orders:syncState` use the local-first signatures.

- [ ] **Step 4: Run the test**

Run: `node --test tests/order-domain-types.test.ts`

Expected: PASS.

### Task 2: Background Order Store

**Files:**
- Create: `src/background/orders/order-index.ts`
- Create: `src/background/orders/order-store.ts`
- Test: `tests/order-store.test.ts`

- [ ] **Step 1: Write store behavior tests**

Create `tests/order-store.test.ts` with a fake storage adapter and assertions that `upsertMany` keeps account metadata, lists all-account orders, filters by status/time, searches indexed text, and enforces a per-account limit.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/order-store.test.ts`

Expected: FAIL because the order store files do not exist.

- [ ] **Step 3: Implement `order-index.ts` and `order-store.ts`**

`order-index.ts` builds normalized searchable text from order id, product title, receiver, merchant notes, and customer notes. `order-store.ts` stores `{ orderSnapshots, orderSyncStates }` under dedicated `chrome.storage.local` keys and exposes `upsertMany`, `list`, `search`, `get`, `getSyncState`, `markSyncStarted`, and `markSyncFinished`.

- [ ] **Step 4: Run store tests**

Run: `node --test tests/order-store.test.ts`

Expected: PASS.

### Task 3: Remote Source and Domain Services

**Files:**
- Create: `src/background/orders/wx-order-source.ts`
- Create: `src/background/orders/order-sync-service.ts`
- Create: `src/background/orders/order-domain-service.ts`
- Modify: `src/background/runtime-handlers/order-handlers.ts`
- Modify: `src/background/router/create-background-router.ts`
- Test: `tests/order-domain-service.test.ts`

- [ ] **Step 1: Write domain service tests**

Create `tests/order-domain-service.test.ts` to verify list reads only the store, local search reads only the store, remote search calls source then writes store, detail refresh calls source and writes store, and all-account refresh continues when one account fails.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/order-domain-service.test.ts`

Expected: FAIL because domain service files do not exist.

- [ ] **Step 3: Implement domain services**

Implement `WxOrderSource` as the only module that calls `getClient(accountId)` for order list/search/detail. Implement `OrderSyncService` with account-level in-flight de-duplication and small-concurrency all-account refresh. Implement `OrderDomainService` as the IPC-facing facade.

- [ ] **Step 4: Wire runtime handlers**

Update `createOrderRuntimeHandlers()` so `orders:list`, `orders:search`, `orders:detail`, `orders:refresh`, and `orders:syncState` delegate to `OrderDomainService`. Keep order action handlers such as decode address, list delivery companies, and ship-from-purchase on real account IDs.

- [ ] **Step 5: Run domain tests**

Run: `node --test tests/order-domain-service.test.ts`

Expected: PASS.

### Task 4: System-Level Scheduled Sync

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/background/scheduler/scheduler-center.ts`
- Create: `src/background/scheduler/order-sync-job-executor.ts`
- Modify: `entrypoints/background.ts`
- Test: `tests/scheduler-system-scope.test.ts`

- [ ] **Step 1: Write scheduler tests**

Create `tests/scheduler-system-scope.test.ts` to verify `parseJobAlarmSchedule('*/1 * * * *')` is supported and a `ScheduledJob` can use `scope: 'system'` with `jobType: 'orders.syncRecent'`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/scheduler-system-scope.test.ts`

Expected: FAIL because `system` scope and `orders.syncRecent` are not part of shared types.

- [ ] **Step 3: Implement system scheduled sync**

Add `system` to `ScheduledJobScope`, add `orders.syncRecent` to `ScheduledJobType`, update scheduler-center account resolution for system jobs, and create `order-sync-job-executor.ts` with `registerOrderSyncScheduledJobs()` and `ensureOrderSyncScheduledJob()`.

- [ ] **Step 4: Wire background startup**

Call `registerOrderSyncScheduledJobs()` before `installRuntimeHandlers()` and `ensureOrderSyncScheduledJob()` before `startAllScheduledJobs()`.

- [ ] **Step 5: Run scheduler tests**

Run: `node --test tests/scheduler-system-scope.test.ts`

Expected: PASS.

### Task 5: Frontend Order Scope and Hooks

**Files:**
- Modify: `src/shared/extension-api.ts`
- Modify: `src/hooks/useOrderQueries.ts`
- Modify: `src/hooks/useIpc.ts`
- Modify: `src/components/Layout.tsx`
- Modify: `src/pages/orders/OrdersPage.tsx`
- Modify: `src/pages/orders/components/OrderToolbar.tsx`
- Modify: `src/pages/orders/components/OrderTableColumns.tsx`

- [ ] **Step 1: Update extension API**

Change `extensionApi.orders.list/search/detail/refresh/syncState` to the local-first signatures and export new order domain types from `useIpc.ts`.

- [ ] **Step 2: Replace order hooks**

Replace `useOrdersQuery` with a local-first `useOrderListQuery(scope, status, search, timeScope)` and add `useOrderSyncStateQuery(scope)` plus `useRefreshOrdersMutation(scope)`. Remove persistent order-list-cache usage from the order list path.

- [ ] **Step 3: Update Layout scope selection**

Show “全部账号” in the order module sidebar and pass `OrderScope` into `OrdersPage`. Keep product listing global scope behavior unchanged.

- [ ] **Step 4: Update OrdersPage actions**

Use row-level `accountId` for details, address decode, associations, product sources, purchase lookup, ship-from-purchase, and Taobao refund flows. In all-account mode, show the account column and avoid account-scoped queries where there is no concrete row account.

- [ ] **Step 5: Update toolbar**

Add search source selection, sync-state text, countdown text, and immediate refresh behavior. Default search source is `local`; remote search is explicit.

### Task 6: Verification and Cleanup

**Files:**
- Modify: files changed by Tasks 1-5 when compile reports a concrete type mismatch in those edits.

- [ ] **Step 1: Run focused tests**

Run:

```bash
node --test tests/order-domain-types.test.ts tests/order-store.test.ts tests/order-domain-service.test.ts tests/scheduler-system-scope.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript compile**

Run: `npm run compile`

Expected: PASS.

- [ ] **Step 3: Commit implementation**

Run:

```bash
git add src tests docs/superpowers/plans/2026-05-25-order-local-first-domain.md
git commit -m "Implement local-first order domain"
```

Expected: Commit succeeds with order domain, scheduler, IPC, and UI changes.
