# Scheduled Job Run Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor scheduled jobs so recurring jobs and run-until-complete jobs are explicit, strongly typed, and managed by the scheduler center.

**Architecture:** Shared scheduled job types become a discriminated union with required lifecycle fields. Executors return a complete result object, and the scheduler center owns completion/finalization for `untilComplete` jobs. Existing order backfill logic keeps its cursor payload but stops managing its own lifecycle.

**Tech Stack:** TypeScript, WXT background service worker, Chrome alarms, React, Ant Design, TanStack Query.

---

### Task 1: Shared Type Model

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/runtime-channels.ts`
- Modify: `src/shared/extension-api.ts`

- [ ] Add `ScheduledJobRunMode`, `ScheduledJobBase`, `AccountScheduledJob`, `GlobalScheduledJob`, `SystemScheduledJob`, `ScheduledJob`, `ScheduledJobView`, and strict `ScheduledJobExecutorResult`.
- [ ] Change `scheduledJobs:list` and `extensionApi.scheduledJobs.list()` to return `ScheduledJobView[]`.
- [ ] Change `scheduledJobs:runNow` to return `ScheduledJobExecutorResult`.

### Task 2: Repository and Scheduler Center

**Files:**
- Modify: `src/background/store/scheduled-job-repository.ts`
- Modify: `src/background/scheduler/scheduler-center.ts`
- Modify: `src/background/runtime-handlers/scheduler-handlers.ts`

- [ ] Make `addScheduledJob()` accept explicit job input with `runMode`, `dailyLimit`, `completedAt`, and scope-specific fields.
- [ ] Return `nextRunAt: number | null` from scheduled job list views.
- [ ] Make executor results complete and non-optional.
- [ ] Enforce `recurring` jobs cannot complete.
- [ ] Finalize `untilComplete` jobs centrally by writing `enabled: false`, `completedAt`, and clearing alarms.

### Task 3: Existing Executors and Job Creation

**Files:**
- Modify: `src/background/scheduler/order-sync-job-executor.ts`
- Modify: `src/background/scheduler/order-shipment-job-executor.ts`
- Modify: `src/background/scheduler/listing-job-executor.ts`
- Modify: `src/pages/common-functions/ListingPage.tsx`

- [ ] Add `runMode: 'recurring'` and `completedAt: null` to recurring job creation.
- [ ] Add `runMode: 'untilComplete'` and `completedAt: null` to order history backfill creation.
- [ ] Remove lifecycle writes from order history backfill executor; it should only update payload and return `completed`.
- [ ] Make every executor return `listed`, `status`, `message`, `error`, and `completed`.

### Task 4: Scheduled Jobs UI

**Files:**
- Modify: `src/pages/scheduled-jobs/ScheduledJobsPage.tsx`
- Modify: `src/pages/scheduled-jobs/scheduled-job-display.ts`
- Modify: `src/pages/orders/order-sync-countdown.ts`

- [ ] Show `已完成` when `enabled === false && completedAt !== null`.
- [ ] Add run mode tags: `周期任务` and `执行至完成`.
- [ ] Treat `nextRunAt` as `number | null`.

### Task 5: Verification

**Files:**
- Read: `docs/superpowers/specs/2026-05-25-scheduled-job-run-mode-design.md`

- [ ] Run `npm run compile`.
- [ ] Run `npm run build`.
- [ ] Fix type or build errors without weakening the explicit type model.
