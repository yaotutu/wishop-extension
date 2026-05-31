# Scheduled Job Error Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make scheduled task failures explain their source in the activity log while keeping notifications concise.

**Architecture:** Add sanitized external request error normalization near the WeChat client, then let scheduler failure logging format concise notification details and detailed activity log details from that normalized context. Reuse existing ActivityLog fields and avoid storage migrations.

**Tech Stack:** TypeScript, WXT MV3 background service worker, Axios, React, Ant Design, Node test runner.

---

### Task 1: Normalized External Error Utilities

**Files:**
- Create: `src/background/errors/external-error.ts`
- Test: `tests/external-error.test.ts`

- [ ] Add tests for network, timeout, HTTP, API, and unknown error normalization.
- [ ] Run `node --test tests/external-error.test.ts` and confirm the tests fail because the module does not exist.
- [ ] Implement `ExternalRequestError`, `normalizeExternalRequestError`, `formatExternalErrorDetail`, and `externalErrorMetadata`.
- [ ] Run `node --test tests/external-error.test.ts` and confirm the tests pass.

### Task 2: WeChat Client Error Context

**Files:**
- Modify: `src/background/wxshop/client.ts`
- Test: `tests/external-error.test.ts`

- [ ] Wrap Axios POST calls in `request()` so transport failures are converted to sanitized `ExternalRequestError`.
- [ ] Include service `微信小店`, HTTP method, and API path without access token.
- [ ] Convert WeChat non-zero `errcode` responses into `ExternalRequestError` with category `api` where those calls already throw.
- [ ] Run `node --test tests/external-error.test.ts`.

### Task 3: Scheduler Failure Formatting

**Files:**
- Modify: `src/background/scheduler/scheduler-center.ts`
- Test: `tests/scheduled-job-error-detail.test.ts`

- [ ] Add tests for failed scheduled job activity detail and notification detail formatting.
- [ ] Run `node --test tests/scheduled-job-error-detail.test.ts` and confirm the tests fail for missing formatter exports.
- [ ] Add formatter helpers that produce detailed ActivityLog detail and concise notification detail.
- [ ] Use the helpers in the scheduler catch block and preserve sanitized metadata.
- [ ] Run `node --test tests/scheduled-job-error-detail.test.ts`.

### Task 4: Log Center Detail Display

**Files:**
- Modify: `src/components/ActivityLogDrawer.tsx`

- [ ] Render selected metadata fields below the error message for failed logs.
- [ ] Keep NotificationCenter unchanged except for consuming the scheduler's concise notification detail.
- [ ] Run `npm run compile`.

### Task 5: Final Verification

**Files:**
- All changed files.

- [ ] Run `node --test tests/external-error.test.ts tests/scheduled-job-error-detail.test.ts`.
- [ ] Run `npm run compile`.
- [ ] Run `npm run build` because background and shared execution paths changed.
