# 定时任务运行模式重构设计

## 背景

当前 `ScheduledJob` 模型把所有任务都表达成 cron 周期任务。`orders.backfillHistory` 实际上是一个有限目标的历史补拉任务，但现在它是在自己的 executor 里直接更新任务记录、停掉自己的 alarm，从而模拟“执行完成后不再运行”。

这能工作，但职责边界不清晰：

- 调度中心认为它只是一个普通周期任务。
- 订单历史补拉 executor 自己知道何时应该停止。
- UI 只能显示它“已停用”，无法表达它是“已完成”。

本次重构没有历史兼容包袱，因此模型应该优先使用明确必传字段和精确 TypeScript 类型，而不是用可选字段和隐式默认值兜底。

## 目标

- 明确表达定时任务生命周期。
- 支持“重复执行直到整体目标完成”的任务。
- 把生命周期管理放回调度中心，而不是让业务 executor 自己管理。
- 能确定的字段必须显式必传。
- 只对特定 scope 有意义的字段，使用 discriminated union 精确表达。
- 区分持久化任务数据和运行时视图数据，例如 `nextRunAt`。
- 让定时任务 UI 能区分“已停用”和“已完成”。

## 非目标

- 不实现按绝对时间只运行一次的任意 one-shot 任务。
- 不替换 `chrome.alarms` 调度后端。
- 不做复杂的旧数据兼容迁移。
- 不重新设计所有业务任务 payload。

## 类型模型

新增必传运行模式：

```ts
export type ScheduledJobRunMode = 'recurring' | 'untilComplete';
```

所有任务都必须具备的基础字段放在 base 类型中：

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

scope 相关字段用 discriminated union 表达：

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

这样既保持严格必传，又不会强迫无意义字段存在。例如 `accountId` 只在 `scope === 'account'` 时存在，`staggerMinutes` 和 `accountStats` 只在 `scope === 'global'` 时存在。

`nextRunAt` 是从 `chrome.alarms` 现场计算出来的运行时字段，不进入持久化模型：

```ts
export type ScheduledJobView<TPayload = unknown> = ScheduledJob<TPayload> & {
  nextRunAt: number | null;
};
```

`scheduledJobs:list` 返回 `ScheduledJobView[]`。仓储层只持久化 `ScheduledJob[]`。

## Executor 契约

executor 返回值改成完整必传结构：

```ts
export interface ScheduledJobExecutorResult {
  listed: number;
  status: ScheduledJobStatus;
  message: string | null;
  error: string | null;
  completed: boolean;
}
```

规则：

- 每个 executor 都必须返回完整的 `ScheduledJobExecutorResult`。
- `recurring` 任务必须返回 `completed: false`。
- `untilComplete` 任务只有在整体目标完成时才返回 `completed: true`，不能把单次运行成功当成整体完成。
- 如果 `recurring` 任务返回 `completed: true`，调度中心应视为 executor 契约错误，并把本次运行记录为失败。
- 如果 `untilComplete` 任务返回 `completed: true`，调度中心统一停用任务、写入 `completedAt`，并清除 alarm。

## 调度中心职责

调度中心统一负责任务生命周期：

1. 校验 cron。
2. 创建和清理 `chrome.alarms`。
3. 执行已注册的 executor。
4. 更新运行统计。
5. 写全局日志。
6. 当 `untilComplete` 任务返回 `completed: true` 时，完成并停用该任务。

完成任务的动作由调度中心统一执行：

```ts
await updateScheduledJob(job.id, {
  enabled: false,
  completedAt: Date.now(),
});
await stopScheduledJob(job.id);
```

业务 executor 不应该调用 `stopScheduledJob()`，也不应该更新自己的生命周期字段。业务 executor 仍然可以更新自己的 payload，因为 payload 可能保存业务进度，例如历史补拉 cursor。

## 订单历史补拉

`orders.backfillHistory` 改成 `untilComplete` 系统任务：

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

它的 executor 保持现有业务行为：

- 读取所有账号。
- 为每个账号计算下一个历史 7 天窗口。
- 拉取并 upsert 该窗口内的订单。
- 成功后推进 `cursorByAccountId`。
- 持久化更新后的 payload。
- 只有所有账号都补拉完成时，才返回 `completed: true`。

executor 不再直接停用任务，也不再直接停止 alarm。

`orders.syncRecent` 保持为 `recurring` 系统任务：

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

## 仓储行为

`addScheduledJob()` 应接受显式完整的任务输入。它只负责生成基础设施字段：

- `id`
- `stats`
- `createdAt`
- `updatedAt`

它不应该静默推断 `runMode`、`dailyLimit`、`completedAt` 或 scope 相关字段。

`updateScheduledJob()` 需要保持 union 正确性。调用方不能通过只写一部分字段，把 system 任务改成不完整的 global 或 account 任务。必要时可以增加更窄的 helper，例如专门用于生命周期更新或 payload 更新的函数。

## Runtime IPC

更新 runtime channel 类型：

- `scheduledJobs:list` 返回 `ScheduledJobView[]`。
- `scheduledJobs:add` 接收包含必传生命周期字段的显式任务输入。
- `scheduledJobs:update` 保留，但应谨慎使用。UI 编辑应传入完整、合法的 patch。
- `scheduledJobs:runNow` 返回完整的 `ScheduledJobExecutorResult` 结构。

## UI 行为

定时任务列表应明确显示生命周期：

- `enabled === true`：显示 `已启用`。
- `enabled === false && completedAt !== null`：显示 `已完成`。
- `enabled === false && completedAt === null`：显示 `已停用`。

增加运行模式标签：

- `recurring`：`周期任务`
- `untilComplete`：`执行至完成`

对于已完成的有限任务，展示完成时间。停用或完成的任务，`nextRunAt` 应为 `null`。

## 验证

实现后运行：

- `npm run compile`
- `npm run build`

需要运行 `npm run build`，因为本次改动涉及共享类型、后台调度、runtime IPC 和插件打包行为。

手动验证：

- 后台启动后会创建显式的 `orders.syncRecent` 和 `orders.backfillHistory` 任务。
- `orders.syncRecent` 成功运行后仍保持启用。
- `orders.backfillHistory` 会跨多次运行推进 cursor。
- 历史补拉全部完成后，由调度中心停用任务并写入 `completedAt`。
- 定时任务 UI 将完成后的历史补拉显示为 `已完成`，而不是单纯 `已停用`。
- 如果 recurring executor 返回 `completed: true`，调度中心会把它作为实现错误处理。
