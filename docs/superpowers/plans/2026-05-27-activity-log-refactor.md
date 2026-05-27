# Activity Log Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the confusing activity-log/createLogger split with ActivityLog for user-facing events and DiagnosticLogger for background diagnostics.

**Architecture:** Activity logs fan out through dedicated sinks: local store, dashboard runtime event, notification derivation, cloud placeholder, and console mirror. Diagnostic logs use the same console sink but never persist and never notify.

**Tech Stack:** WXT Chrome MV3, TypeScript, React, TanStack Query, Ant Design, Dexie, Node test runner.

---

### Task 1: Tests

**Files:**
- Create: `tests/activity-log-console-sink.test.ts`
- Modify: `tests/order-domain-service.test.ts`

- [x] Add a failing test proving an activity log can be formatted for Service Worker console output.
- [x] Add a failing order refresh test proving manual all-account refresh emits activity start and final summary records.
- [x] Run `node --test tests/activity-log-console-sink.test.ts tests/order-domain-service.test.ts` and confirm the new tests fail for missing implementation.

### Task 2: Activity Log Types And Sinks

**Files:**
- Create: `src/shared/activity-log.ts`
- Create: `src/background/activity-logs/activity-log-service.ts`
- Create: `src/background/activity-logs/activity-log-store.ts`
- Create: `src/background/activity-logs/sinks/console-log-sink.ts`
- Rename activity-log sink files under `src/background/activity-logs/sinks/`
- Delete old `src/shared/activity-log.ts` and `src/background/activity-logs/`

- [x] Rename `ActivityLog*` types to `ActivityLog*`.
- [x] Rename fields `module -> domain`, `eventType -> event`, and `taskKind -> trigger`.
- [x] Add console mirroring to activity log recording.
- [x] Keep notification derivation only when `notification.topic` is explicit.

### Task 3: Diagnostic Logger

**Files:**
- Create: `src/background/logging/diagnostic-logger.ts`
- Create: `src/background/logging/console-log-sink.ts`
- Delete: `src/background/utils/logger.ts`

- [x] Replace `createLogger(...)` imports with `createDiagnosticLogger(...)`.
- [x] Use `{ domain, component, accountId }` context objects so call sites are self-explanatory.
- [x] Keep diagnostic logs console-only.

### Task 4: Runtime And UI Rename

**Files:**
- Rename: `src/hooks/useActivityLogs.ts` to `src/hooks/useActivityLogs.ts`
- Rename: `src/components/ActivityLogDrawer.tsx` to `src/components/ActivityLogDrawer.tsx`
- Modify: `src/shared/runtime-channels.ts`
- Modify: `src/shared/extension-api.ts`
- Modify: `src/query/query-keys.ts`
- Modify: `src/components/NotificationCenter.tsx`

- [x] Rename runtime channels to `activityLogs:list` and `activityLogs:clear`.
- [x] Rename runtime event to `activityLog:added`.
- [x] Update notification UI to read `domain`, `event`, and `trigger`.

### Task 5: Order Refresh Activity Logs

**Files:**
- Modify: `src/background/orders/order-sync-service.ts`
- Create: `src/background/orders/order-sync-activity-log.ts`
- Modify: `src/background/orders/order-domain.ts`

- [x] Add an optional order sync activity sink dependency for testable business activity logging.
- [x] Emit activity start for manual all-account refresh.
- [x] Emit final activity completed/failed summary without logging per-account detail to the page drawer.

### Task 6: Project Guidance And Verification

**Files:**
- Modify: `AGENTS.md`

- [x] Update the log-center guidance with ActivityLog and DiagnosticLogger names.
- [x] Run `node --test tests/activity-log-console-sink.test.ts tests/order-domain-service.test.ts`.
- [x] Run `npm run compile`.
- [x] Run `npm run build` because background runtime files changed.
