# Scheduled Job Error Observability Design

## Goal

When a scheduled background task fails, the notification center should stay concise, while the activity log center must include enough context for the user to judge whether the issue is transient, configuration-related, account-specific, or a code/API problem.

## Scope

This change focuses on scheduled task failures caused by background execution paths, especially order-related global tasks such as shipment status checks. It improves the way errors are normalized, stored, and displayed. It does not change task scheduling behavior, retry policy, notification preferences, or WeChat API business logic.

## User-Facing Behavior

Notification center entries remain short. A failed scheduled task notification should identify:

- task name
- account or account scope
- broad failure reason

Activity log center entries show detailed troubleshooting context. A failed scheduled task log should include:

- task name and job type
- trigger type and account name
- execution stage
- external service name
- API endpoint when known
- normalized error category
- sanitized error message
- practical hint for whether the failure is likely transient

## Architecture

Error normalization belongs near the source of external requests. WeChat client code should catch HTTP/network errors and throw sanitized errors that keep useful diagnostic fields without exposing access tokens or credentials.

Scheduled task orchestration should enrich failures with task context. The scheduler already knows task name, job type, trigger, account, and run ID, so it should combine those fields with any sanitized downstream error details before writing ActivityLog.

The notification sink should continue deriving notification entries from ActivityLog, but the scheduler should provide a short notification detail separately from the detailed ActivityLog detail.

## Data Model

Use the existing `ActivityLogError`, `detail`, and `metadata` fields. Do not add persistent schema or migration unless implementation proves the existing fields cannot represent the needed data.

Recommended metadata keys:

- `jobType`
- `stage`
- `service`
- `endpoint`
- `errorKind`
- `httpStatus`
- `requestId`

Metadata values must remain primitive and sanitized.

## Error Handling

Classify external request failures into stable categories:

- `network`: request did not receive a response, DNS/proxy/offline/TLS-style failures
- `timeout`: request timed out or was aborted
- `http`: non-2xx HTTP response
- `api`: WeChat API returned a business error code
- `unknown`: fallback when the cause cannot be classified

For transient categories such as `network` and `timeout`, the detailed log should say the issue may be ignored if occasional, but should be investigated if repeated.

## Testing

Add focused tests for error normalization and message formatting where feasible. Run `npm run compile` after implementation. If background, shared type, or build-sensitive files change, run `npm run build` as well.
