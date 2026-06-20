# 工作台日志中心指南

> 写日志、写通知、排查后台运行过程、或改 `src/background/activity-logs/`、`src/background/logging/`、`src/background/notification-center/` 时必读。

工作台日志中心是用户可读业务活动与通知的唯一入口。日志模块和通知模块不是两套系统；通知只是 ActivityLog 里带有 `notification` 意图的派生视图。

- 共享业务活动日志类型位于 `src/shared/activity-log.ts`。
- 共享通知类型位于 `src/shared/notification.ts`。
- 后台 ActivityLog 基础设施位于 `src/background/activity-logs/`。
- 后台诊断日志基础设施位于 `src/background/logging/`。
- 通知持久化、已读、清空和偏好管理位于 `src/background/notification-center/`，但业务代码不得直接调用通知中心生成通知。
- UI 通过 `src/hooks/useActivityLogs.ts`、`src/components/ActivityLogDrawer.tsx` 和 `src/components/NotificationCenter.tsx` 展示日志与通知。

ActivityLog 只有一个事实入口：`src/background/activity-logs/activity-log-service.ts`。业务模块必须通过 `recordActivity`、`recordActivityStarted`、`recordActivityCompleted`、`recordActivitySkipped`、`recordActivityFailed`、`recordActivityWaitingUser` 或 `createActivityRecorder` 写用户可读业务活动；不要在业务代码中直接写 `chrome.storage.local.activityLogs`、`notifications` 或其它日志/通知存储。

## 日志分类

日志分两类：

1. ActivityLog：记录用户或系统应该知道的结构化事实，例如任务开始、完成、失败、等待用户处理、授权失效、配额耗尽和重要任务摘要。ActivityLog 会进入页面日志中心，并自动镜像到 Service Worker 控制台。
2. DiagnosticLogger：记录开发排查需要的运行细节，例如接口请求参数、时间窗口、返回数量、账号处理进度、页面读取结果和异常堆栈。诊断日志必须通过 `createDiagnosticLogger({ domain, component, accountId })` 写入，只输出到 Service Worker 控制台，不进入页面日志中心，不触发通知。

## 后台完整日志查看规则

1. 用户日常只看页面右下角“日志中心”，那里只展示 ActivityLog。
2. 开发排查后台完整过程只看 Chrome 扩展的 Service Worker 控制台，那里同时包含 ActivityLog 镜像和 DiagnosticLogger 细节。
3. `npm run dev` 终端只看 WXT 启动、编译、热更新和构建错误，不承担业务日志观察职责。
4. React 页面控制台只排查后台管理页 UI 问题。

## 通知规则

1. 通知不是独立入口，只能从 ActivityLog 派生。
2. 只有 ActivityLog entry 显式带 `notification.topic` 时，才会进入通知视图；没有 `notification` 的 ActivityLog 永远只作为日志展示。
3. 普通 `started`、`completed`、`skipped`、`failed`、`warning` 或 `error` 级别本身都不自动生成通知。
4. 不允许在调度中心、业务 service、runtime handler 或 UI 中根据状态自动创建通知；需要通知时，必须在写日志时显式声明 `notification: { topic, urgency }`。
5. `NotificationTopic` 是用户可配置通知场景的唯一事实来源。新增通知场景必须先在 `src/shared/notification.ts` 中添加 topic、默认开关和中文说明。
6. 通知来源必须能追溯到对应日志 `sourceLogId`，不要创建无来源的重要通知。
7. 失败通知必须包含明确 `error.message` 或可读原因；成功通知默认不打扰用户，除非该成功事件对应明确业务通知 topic。

## 诊断日志规则

1. DiagnosticLogger 不触发通知，不进入页面日志中心，不作为业务状态来源。
2. DiagnosticLogger 适合高频、细粒度、诊断用途；ActivityLog 适合低频、结构化、用户可读的重要事实。
3. 后台业务代码不得直接散落 `console.*`；需要诊断输出时使用 `createDiagnosticLogger({ domain, component, accountId })`。
4. ActivityLog 的控制台镜像由 activity log service 的 console sink 统一完成，业务代码不要手动重复打印同一条活动日志。

## 安全规则

1. ActivityLog、DiagnosticLogger 和通知都是观测数据，不得作为业务状态的数据源。
2. ActivityLog、DiagnosticLogger、通知和云端分析都不得记录或上传 access token、appSecret、真实地址、手机号、客户隐私数据、订单敏感明细或其它凭证。
3. 未来云端分析必须使用 ActivityLog cloud sink 和结构化字段，例如 `domain`、`event`、`trigger`、`runId`、`summary` 和 `error`。
4. 持久化 schema 变更必须走 `src/background/store/migrations.ts` 并提升 `CURRENT_STORAGE_VERSION`；本项目没有历史兼容包袱，不要长期保留旧结构兼容分支。
