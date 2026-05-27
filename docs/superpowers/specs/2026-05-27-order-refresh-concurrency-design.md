# Order Refresh Concurrency Design

## Goal

Make the Orders page "全部账号 / 立即更新" refresh accounts concurrently while keeping the implementation small and predictable.

## Confirmed Scope

- Account-level refresh uses a fixed concurrency limit of 10.
- The concurrency limit is hard-coded, not user-configurable.
- Duplicate refreshes for the same account are acceptable. Do not add account locks.
- One account failure must not stop other accounts.
- All business outcomes are returned as structured refresh results.
- All-account business failures return `status: 'failed'` and preserve per-account failure details.

## Design

`order-sync-service` remains the orchestration boundary. It will run account refresh workers through a small in-file concurrency helper instead of a sequential `for...of` loop.

The network-heavy part runs concurrently. Sync-state writes remain serialized through a small commit queue so concurrent account completions do not overwrite each other's status updates in the current store implementation.

`OrderRefreshResult` is the single result model. It includes `status: 'completed' | 'partial_failed' | 'failed'`, refreshed account ids, failed account details, fetched count, and updated count. Account API failures are business results, not thrown IPC errors.

To reduce risk from acceptable duplicate refreshes, order upserts should not let an older order payload overwrite a newer local order state. If the incoming order has an older `update_time` than the stored order, keep the stored order payload and status while still counting the order as fetched.

## Error Handling

- Per-account refresh errors are caught inside the account worker.
- A failed account updates its account sync state with `lastError`.
- Successful accounts update their account sync state independently.
- The aggregate scope sync state is written after all workers settle.
- Empty account scope remains a system error and may throw.

## Verification

Add focused tests for:

- Maximum concurrent account refreshes does not exceed 10.
- A failed account does not block other concurrent accounts.
- Older duplicate refresh payloads do not overwrite newer local order data.
