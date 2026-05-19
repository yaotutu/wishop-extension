# Repository Guidelines

## Project Structure & Module Organization

This is a WXT Chrome Manifest V3 extension built with React, TypeScript, and Ant Design.

- `entrypoints/background.ts` registers the extension background entrypoint.
- `entrypoints/dashboard/` contains dashboard HTML and React bootstrapping.
- `entrypoints/taobao-shipping.content.tsx` registers the Taobao/Tmall content script for the order shipping assistant.
- `src/App.tsx`, `src/main.tsx`, and `src/index.css` provide the app shell and global styles.
- `src/components/` contains shared UI such as layout, statistic cards, and account modals.
- `src/pages/` contains feature pages, grouped by domain: `orders`, `settings`, `store-management`, `violation`, and `common-functions`.
- `src/pages/orders/` is split by responsibility: `OrdersPage.tsx` owns page state and actions, `components/` owns table columns, toolbar, detail modal, and source modals, and `order-display.ts` owns order display helpers.
- `src/background/` contains background runtime wiring, feature handlers, schedulers, task modules, services, repositories, and WeChat shop client code.
- `src/background/handlers.ts` should stay a thin runtime message transport. Add new IPC behavior through `src/background/router/`, `src/background/runtime-handlers/`, and `src/background/services/`.
- `src/background/store/` contains storage repositories. Keep `src/background/store.ts` as a compatibility export layer; new background code should import specific repositories directly.
- `src/content/taobao/` contains Taobao/Tmall page adapters and injected UI for the shipping assistant.
- `src/hooks/`, `src/contexts/`, and `src/shared/` hold reusable hooks, providers, shared types, errors, and IPC helpers.
- `src/shared/runtime-channels.ts` is the source of truth for runtime IPC channel argument and result types.
- `public/` and `assets/` store static extension assets and icons.

## Architecture Guidelines

Background code is layered as:

1. `src/background/handlers.ts`: runtime message listener only.
2. `src/background/router/`: channel registration, feature gates, and dispatch.
3. `src/background/runtime-handlers/`: IPC argument adaptation and feature-level entrypoints.
4. `src/background/services/`: business workflows such as draft fetching, order queries, task runs, and violation scans.
5. `src/background/modules/`: lower-level task algorithms.
6. `src/background/store/`, `src/background/wxshop/`, and `src/background/global-logs/`: infrastructure.

Do not add new switch cases to `handlers.ts`. Add a typed channel in `src/shared/runtime-channels.ts`, expose it through `src/shared/extension-api.ts`, then register a runtime handler in `src/background/router/create-background-router.ts`.

Runtime IPC must stay typed. Every new channel must be added to `RuntimeChannels` with explicit `args` and `result` types. Frontend code should call IPC through `extensionApi`, not raw `chrome.runtime.sendMessage`, except for low-level event listeners already wrapped by shared helpers.

Storage uses `chrome.storage.local` with versioned migrations. Keep data migrations in `src/background/store/migrations.ts` and bump `CURRENT_STORAGE_VERSION` in `src/background/store/core.ts` when changing persisted schema. Do not silently reshape persisted account data inside UI components or unrelated services.

`wxt.config.ts` host permissions should remain grouped in `HOST_PERMISSIONS` with comments explaining the user-facing purpose of each domain. Prefer convenience for merchant workflows, but avoid unexplained broad permissions.

## Shipping Assistant Guidelines

The order shipping flow is session-based:

- Dashboard order actions create a short-lived `ShippingSession` through background IPC.
- Background opens the Taobao/Tmall tab and binds `tabId` to the session.
- The content script requests the session from background and mounts the toolbar.
- Content scripts must not read WeChat credentials or call WeChat APIs directly.

Taobao/Tmall DOM access belongs behind adapters in `src/content/taobao/`. Keep selectors and page-detection logic out of toolbar components. Future automation should add stable adapter methods such as `detect`, `read`, `fill`, and `validate` before changing UI code.

## Licensing Guidelines

Licensing structure exists but enforcement is intentionally disabled until the service backend is ready.

- Shared license types live in `src/shared/types.ts`.
- Local license persistence lives in `src/background/store/license-repository.ts`.
- License business logic lives in `src/background/licensing/licensing-service.ts`.
- License IPC lives in `src/background/runtime-handlers/license-handlers.ts`.
- Router-level feature gates live in `src/background/router/create-background-router.ts` and `src/background/router/runtime-router.ts`.
- The settings page has an authorization status panel, but `enforcementEnabled` defaults to `false`.

Do not block user workflows with license checks until the backend is implemented and the project owner explicitly enables enforcement. New paid-capable features should still be mapped to a `LicensedFeature` in the router feature map so enforcement can be turned on later without reworking every module.

## Build, Test, and Development Commands

- `npm install` installs dependencies and runs `wxt prepare`.
- `npm run dev` starts the WXT development server for Chrome.
- `npm run dev:firefox` starts development mode targeting Firefox.
- `npm run compile` runs `tsc --noEmit` for TypeScript validation.
- `npm run build` builds the Chrome extension package.
- `npm run build:firefox` builds the Firefox variant.
- `npm run zip` and `npm run zip:firefox` create distributable extension archives.

## Coding Style & Naming Conventions

Use TypeScript modules with ES imports and React functional components. Match two-space indentation, single quotes, and semicolons. Name React components in `PascalCase` (`OrdersPage.tsx`), hooks with `use` prefixes (`useOrders.ts`), and background modules with descriptive kebab-case filenames (`violation-detect.ts`). Keep IPC channel strings namespaced by feature, such as `accounts:list` or `scheduler:update`.

## Testing Guidelines

No automated test framework is currently configured in `package.json`. For every change, run `npm run compile`; for background, manifest, or packaging changes, also run `npm run build`. When adding tests, colocate them with the feature or use a dedicated `tests/` directory. Prefer `*.test.ts` or `*.test.tsx` names.

## Commit & Pull Request Guidelines

This checkout does not include Git history, so no repository-specific commit convention can be inferred. Use short imperative commits, for example `Add scheduler quota validation` or `Fix order search pagination`.

Pull requests should include a clear summary, verification commands, linked issue or task context, and screenshots or recordings for UI changes. Note permission, manifest, or API behavior changes.

## Security & Configuration Tips

Do not commit live app credentials, access tokens, or customer data. Treat account configuration and WeChat API client values as sensitive. Keep new host permissions in `wxt.config.ts` narrow and explain permission changes in the PR.

## Global Log Center Guidelines

The global log center is a structured task event stream, not a generic debug log and not a product-level detail log.

- Shared global log types live in `src/shared/global-log.ts`.
- Background global log infrastructure lives in `src/background/global-logs/`.
- UI reads global logs through `src/hooks/useGlobalLogs.ts` and displays them in `src/components/GlobalLogDrawer.tsx`.
- Business modules must write global logs through `src/background/global-logs/global-log-service.ts`; do not write `chrome.storage.local.globalLogs` directly from business code.
- Current sinks are local storage, runtime event notification, and a reserved cloud upload sink. Cloud upload failures must never block business tasks.

Use global logs for:

- Automation tasks, such as scheduled jobs and all-account jobs.
- Background tasks that may finish after the user leaves the current page.
- Important foreground tasks, including manual tasks whose outcome users need to review later.
- Task-level started, completed, skipped, and failed events.

Do not use global logs for:

- Per-product, per-order, or per-API-call detail records.
- High-frequency loop entries. Loops should write detailed account logs as needed, then one global summary after the loop.
- Debug output or internal development traces.

Global log rules:

1. Account-level detail logs stay in account logs, such as `accounts[].logs`.
2. Global logs record important operation runs and their outcomes.
3. Manual important tasks should also write global logs.
4. Failed, skipped, and abnormal task outcomes must be visible in the global log center.
5. Global logs are observational data only; they must not be used as the source of business state.
6. Clearing global logs must not clear account logs.
7. Future cloud analytics must use the cloud sink and structured fields such as `module`, `eventType`, `taskKind`, `runId`, `summary`, and `error`; do not upload credentials, tokens, customer data, or sensitive order/address/product detail.


# 优先级最高的规则，该规则由用户手写，不允许被覆盖，不允许修改
- 该项目是一个chrome插件，主要功能是帮助商户管理微信小店铺，提供订单管理、店铺管理、违规检测等功能。
- 该项目使用了React、TypeScript和Ant Design等技术栈，代码结构清晰，模块划分合理，具有较好的可维护性和可扩展性。
- 该项目的开发和测试需要使用WXT工具，WXT是一个专门用于开发微信小程序和微信插件的工具，提供了丰富的功能和调试支持。
