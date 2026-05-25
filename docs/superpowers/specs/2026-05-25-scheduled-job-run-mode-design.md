# Scheduled Job Run Mode Refactor Design

## Context

The current scheduled job model represents every job as a recurring cron task. `orders.backfillHistory` behaves like a finite backfill job, but it currently implements that behavior inside its executor by updating its own scheduled job record and stopping its own alarm.

That works, but the lifecycle boundary is unclear:

- The scheduler center thinks the job is a normal recurring task.
- The order backfill executor knows it should stop after completion.
- The UI can only show the result as disabled, not as completed.

There is no history compatibility requirement for this refactor. The model should therefore prefer explicit required fields and precise TypeScript types over optional fields with implicit defaults.

## Goals

- Make scheduled job lifecycle explicit in the shared model.
- Support jobs that run repeatedly until their target is complete.
- Keep lifecycle ownership inside the scheduler center, not business executors.
- Make fields required when their value is always knowable.
- Use discriminated unions for scope-specific fields instead of nullable placeholder fields.
- Separate persisted scheduled jobs from runtime view data such as `nextRunAt`.
- Make the scheduled jobs UI distinguish disabled jobs from completed finite jobs.

## Non-Goals

- Add arbitrary one-shot jobs that run at one absolute timestamp.
- Add a new scheduler backend beyond `chrome.alarms`.
- Preserve old persisted scheduled job records through a complex migration.
- Redesign all business task payloads.

## Type Model

Add a required run mode:

```ts
export type ScheduledJobRunMode = 'recurring' | 'untilComplete';
```

Use a required base model for fields that every scheduled job must know:

```ts
export interface ScheduledJobBase<TPayload = unknown> {
  id: string;
  name: string;
  enabled: boolean;
  module: ScheduledJobModule;
  jobType: ScheduledJobType;
  runMode: ScheduledJobRunMode;
  cronExpression: string;
  dailyLimit: number;
  payload: TPayload;
  completedAt: number | null;
  stats: ScheduledJobRunStats;
  createdAt: number;
  updatedAt: number;
}
```

Use a discriminated union for scope-specific fields:

```ts
export type AccountScheduledJob<TPayload = unknown> = ScheduledJobBase<TPayload> & {
  scope: 'account';
  accountId: string;
};

export type GlobalScheduledJob<TPayload = unknown> = ScheduledJobBase<TPayload> & {
  scope: 'global';
  excludedAccountIds: string[];
  staggerMinutes: number;
  accountStats: Record<string, ScheduledJobRunStats>;
};

export type SystemScheduledJob<TPayload = unknown> = ScheduledJobBase<TPayload> & {
  scope: 'system';
};

export type ScheduledJob<TPayload = unknown> =
  | AccountScheduledJob<TPayload>
  | GlobalScheduledJob<TPayload>
  | SystemScheduledJob<TPayload>;
```

This keeps required fields strict without forcing meaningless placeholders. For example, `accountId` exists only when `scope === 'account'`, and `staggerMinutes` plus `accountStats` exist only when `scope === 'global'`.

Keep runtime-only alarm data out of persistence:

```ts
export type ScheduledJobView<TPayload = unknown> = ScheduledJob<TPayload> & {
  nextRunAt: number | null;
};
```

`scheduledJobs:list` should return `ScheduledJobView[]`. The repository should persist only `ScheduledJob[]`.

## Executor Contract

Make executor results explicit and complete:

```ts
export interface ScheduledJobExecutorResult {
  listed: number;
  status: ScheduledJobStatus;
  message: string | null;
  error: string | null;
  completed: boolean;
}
```

Rules:

- Every executor must return a complete `ScheduledJobExecutorResult`.
- Recurring jobs must return `completed: false`.
- `untilComplete` jobs return `completed: true` only when their whole target has been completed, not merely when a single run succeeds.
- If a recurring job returns `completed: true`, the scheduler center treats this as an executor contract violation and records the run as failed.
- If an `untilComplete` job returns `completed: true`, the scheduler center disables the job, writes `completedAt`, and clears its alarm.

## Scheduler Center Lifecycle

The scheduler center owns scheduled job lifecycle:

1. Validate the job cron.
2. Create and clear `chrome.alarms`.
3. Execute registered job executors.
4. Update stats.
5. Write global logs.
6. For `untilComplete` jobs, finalize the job when the executor returns `completed: true`.

Finalize means:

```ts
await updateScheduledJob(job.id, {
  enabled: false,
  completedAt: Date.now(),
});
await stopScheduledJob(job.id);
```

Business executors should not call `stopScheduledJob()` or update their own lifecycle fields. They may update their own payload when they need progress state.

## Order History Backfill

`orders.backfillHistory` becomes an `untilComplete` system job:

```ts
{
  name: '订单历史补拉',
  enabled: true,
  module: 'orders',
  jobType: 'orders.backfillHistory',
  scope: 'system',
  runMode: 'untilComplete',
  cronExpression: ORDER_HISTORY_BACKFILL_CRON,
  dailyLimit: 0,
  completedAt: null,
  payload: {
    lookbackDays: 182,
    cursorByAccountId: {},
  },
}
```

Its executor keeps the existing business behavior:

- Read all accounts.
- For each account, calculate the next historical seven-day window.
- Fetch and upsert orders for that window.
- Advance `cursorByAccountId` for successful accounts.
- Persist the updated payload.
- Return `completed: true` only when all accounts are fully backfilled.

The executor no longer disables the job or stops alarms directly.

`orders.syncRecent` remains a recurring system job:

```ts
{
  name: '订单自动同步',
  enabled: true,
  module: 'orders',
  jobType: 'orders.syncRecent',
  scope: 'system',
  runMode: 'recurring',
  cronExpression: ORDER_RECENT_SYNC_CRON,
  dailyLimit: 0,
  completedAt: null,
  payload: {},
}
```

## Repository Behavior

`addScheduledJob()` should accept a fully explicit scheduled job input. It should only generate infrastructure fields:

- `id`
- `stats`
- `createdAt`
- `updatedAt`

It should not silently infer `runMode`, `dailyLimit`, `completedAt`, or scope-specific fields.

`updateScheduledJob()` should preserve union correctness. Callers must not be able to turn a system job into a partial global or account job by writing only one scope field. If needed, expose narrower helpers for lifecycle updates and payload updates.

## Runtime IPC

Update runtime channel types:

- `scheduledJobs:list` returns `ScheduledJobView[]`.
- `scheduledJobs:add` accepts explicit job input with required lifecycle fields.
- `scheduledJobs:update` remains available but should be used carefully. UI-level edits should pass complete, valid patches.
- `scheduledJobs:runNow` returns the explicit `ScheduledJobExecutorResult` shape.

## UI Behavior

The scheduled jobs table should show lifecycle clearly:

- `enabled === true`: show `已启用`.
- `enabled === false && completedAt !== null`: show `已完成`.
- `enabled === false && completedAt === null`: show `已停用`.

Add a run mode tag:

- `recurring`: `周期任务`
- `untilComplete`: `执行至完成`

For completed finite jobs, show the completed time in the recent run or schedule area. `nextRunAt` should be `null` for disabled and completed jobs.

## Validation

Run after implementation:

- `npm run compile`
- `npm run build` because this changes shared types, background scheduling, runtime IPC, and extension packaging behavior.

Manual checks:

- Starting the background creates explicit `orders.syncRecent` and `orders.backfillHistory` jobs.
- `orders.syncRecent` remains enabled after successful runs.
- `orders.backfillHistory` advances cursor state across runs.
- When backfill completes, the scheduler center disables the job and writes `completedAt`.
- Scheduled jobs UI displays completed backfill as `已完成`, not merely `已停用`.
- A recurring executor returning `completed: true` is treated as an implementation error.
