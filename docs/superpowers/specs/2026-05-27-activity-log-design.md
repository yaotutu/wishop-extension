# Activity Log Design

## Goal

Make logging understandable by giving each runtime surface one clear responsibility:

- Dashboard activity log: user-readable business events.
- Service Worker console: complete background diagnostics.
- `npm run dev`: WXT startup, compile, and hot-reload output only.

## Naming

The old `ActivityLog` name is replaced with `ActivityLog` because the page drawer shows business activity, not every log in the system.

- `module` becomes `domain`.
- `eventType` becomes `event`.
- `taskKind` becomes `trigger`.
- `createLogger` becomes `createDiagnosticLogger`.

## Data Flow

Activity logs are written through `recordActivity` and helper methods such as `recordActivityStarted`, `recordActivityCompleted`, and `recordActivityFailed`.

Each activity log goes to:

- local IndexedDB activity log store,
- dashboard runtime event,
- notification sink when `notification.topic` is explicit,
- Service Worker console mirror.

Diagnostic logs are written through `createDiagnosticLogger(...)`. They only go to the Service Worker console.

## Notification Rule

Notifications stay as a derived view of activity logs. A notification is created only when an activity log explicitly contains `notification.topic`. Diagnostic logs never create notifications.

## Order Refresh

Manual all-account order refresh writes user-facing activity logs for task start and final outcome. Per-account progress and API details stay in diagnostic logs. The final activity summary includes account count, concurrency limit, success count, failure count, fetched order count, and updated order count.
