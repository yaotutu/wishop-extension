# Activity Log Module

Activity logs are structured, user-readable business events. They are used for automation, background tasks, and important foreground tasks that users need to review later.

Rules:

- Record important task-level events only. Product-level or API-level details stay in DiagnosticLogger output or module-owned page logs such as listing logs or violation logs.
- Manual tasks are allowed when the task is important, long-running, or high-impact.
- Scheduled and background tasks must record skipped, completed, and failed outcomes.
- Loops must not write one activity log per item. Write one summary after the loop.
- Activity logs are observational data only. They must not be used as the source of business state.
- Clearing activity logs must not clear module page logs.
- Business modules should call `activity-log-service`, not storage or sinks directly.
- Cloud upload is a sink. Upload failure must never block the business task.
- Notification center consumes activity logs and creates user-facing reminders only when `notification.topic` is explicit. Business modules should not call notification channels directly.
- Every activity log is mirrored to the Service Worker console. Do not duplicate the same activity with DiagnosticLogger.

Current sinks:

- `local-log-sink`: persists activity log records in IndexedDB `accountLogs`.
- `runtime-event-sink`: notifies the dashboard through `activityLog:added`.
- `console-log-sink`: mirrors activity logs to the Service Worker console.
- `cloud-log-sink`: reserved no-op for future analytics upload.
