# Order Refresh Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all-account manual order refresh run accounts concurrently with a hard-coded limit of 10 while preserving per-account failure isolation through one structured result model.

**Architecture:** Keep orchestration inside `src/background/orders/order-sync-service.ts`. Add a small concurrency helper and a serialized sync-state commit queue. Return `OrderRefreshResult.status` for completed, partial failure, and failed business outcomes. Harden `src/background/orders/order-store.ts` so older duplicate refresh payloads cannot replace newer local order data.

**Tech Stack:** TypeScript, Node test runner, existing in-memory order store tests, Dexie-backed production order store.

---

### Task 1: Add Failing Concurrency Test

**Files:**
- Modify: `tests/order-domain-service.test.ts`

- [x] Add a test named `all-account refresh runs at most ten accounts concurrently`.
- [x] Use 25 accounts and a manually released promise gate.
- [x] Assert the observed maximum concurrent `fetchRecentOrders` calls is 10.
- [x] Run `node --test tests/order-domain-service.test.ts`.
- [x] Expected before implementation: the test fails because current refresh is sequential and maximum concurrency is 1.

### Task 2: Implement Account Concurrency

**Files:**
- Modify: `src/background/orders/order-sync-service.ts`

- [x] Add `ORDER_REFRESH_ACCOUNT_CONCURRENCY = 10`.
- [x] Add a local `runWithConcurrency` helper.
- [x] Replace the sequential account loop with the helper.
- [x] Keep per-account try/catch so one account failure does not interrupt the pool.
- [x] Serialize calls to `markSyncFinished` through a commit promise chain.
- [x] Run `node --test tests/order-domain-service.test.ts`.
- [x] Expected after implementation: concurrency and existing failure-isolation tests pass.

### Task 3: Add Failing Stale Overwrite Test

**Files:**
- Modify: `tests/order-domain-service.test.ts`

- [x] Add a test named `older duplicate refresh payload does not overwrite newer local order data`.
- [x] Preload an order with higher `update_time` and completed status.
- [x] Refresh the same order with lower `update_time` and pending status.
- [x] Assert the local stored order keeps the newer completed status.
- [x] Run `node --test tests/order-domain-service.test.ts`.
- [x] Expected before implementation: the test fails because `upsertMany` currently writes the incoming payload.

### Task 4: Harden Order Upsert

**Files:**
- Modify: `src/background/orders/order-store.ts`

- [x] In both IndexedDB and memory store `upsertMany`, detect `incoming.update_time < previous.order.update_time`.
- [x] For stale incoming payloads, keep the previous order payload and indexed text.
- [x] Count the stale order as fetched but not changed.
- [x] Run `node --test tests/order-domain-service.test.ts`.
- [x] Expected after implementation: stale overwrite test passes.

### Task 5: Verify

**Files:**
- No new files.

- [x] Run `node --test tests/order-domain-service.test.ts`.
- [x] Run `npm run compile`.
- [x] If compile exposes unrelated type issues, report them clearly instead of masking them.
