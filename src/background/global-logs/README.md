# Global Log Module

Global logs are structured task events. They are used for automation, background tasks, and important foreground tasks that users need to review later.

Rules:

- Record important task-level events only. Product-level or API-level details stay in module-owned page logs such as listing logs or violation logs.
- Manual tasks are allowed when the task is important, long-running, or high-impact.
- Scheduled and background tasks must record skipped, completed, and failed outcomes.
- Loops must not write one global log per item. Write one summary after the loop.
- Global logs are observational data only. They must not be used as the source of business state.
- Clearing global logs must not clear module page logs.
- Business modules should call `global-log-service`, not storage or sinks directly.
- Cloud upload is a sink. Upload failure must never block the business task.
- Notification center consumes global logs and decides whether to create user-facing reminders. Business modules should not call notification channels directly.

Current sinks:

- `local-log-sink`: persists to `chrome.storage.local.globalLogs`.
- `runtime-event-sink`: notifies the dashboard through `globalLog:added`.
- `cloud-log-sink`: reserved no-op for future analytics upload.
