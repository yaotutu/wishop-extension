# 定时任务中心指南

> 新增或改定时任务、`src/background/scheduler/`、`ScheduledJob` 时必读。

定时任务只允许走统一 `ScheduledJob` 架构，不保留旧兼容层。

- 共享任务类型位于 `src/shared/types.ts` 的 `ScheduledJob`、`ScheduledJobType`、`ScheduledJobScope` 和 `ScheduledJobRunStats`。
- 定时任务 IPC 只使用 `scheduledJobs:list`、`scheduledJobs:add`、`scheduledJobs:update` 和 `scheduledJobs:remove`。
- 前端只能通过 `extensionApi.scheduledJobs` 调用定时任务 IPC，不要新增 `scheduler:*`、`globalScheduler:*` 或其它按业务域拆散的调度 IPC。
- 定时任务持久化只使用 `src/background/store/scheduled-job-repository.ts` 的 `scheduledJobs`。不要重新引入 `accounts[].schedulers`、`globalSchedulers` 或旧的 scheduler repository。
- 后台唯一调度入口是 `src/background/scheduler/scheduler-center.ts`。它负责创建和清理 `chrome.alarms`、处理账号级和全局级任务、更新运行统计、写全局日志。
- 业务模块如果需要定时执行，应新增明确的 `ScheduledJobType`，并在对应 executor 文件中调用 `registerScheduledJobExecutor`。例如商品提审使用 `listing.submitDrafts`，订单发货检测应使用类似 `orders.checkShipmentStatus` 的任务类型。
- `entrypoints/background.ts` 负责注册所有 executor，然后安装 `installScheduledJobAlarmListener()`，迁移存储后调用 `startAllScheduledJobs()`。
- 账号级任务使用 `scope: 'account'` 和 `accountId`；全账号任务使用 `scope: 'global'`、`excludedAccountIds` 和可选 `staggerMinutes`。
- 调度中心会统一写全局日志。业务 executor 内部只处理业务流程和必要的账号级明细日志，不要自己写任务级 started、completed、skipped、failed 全局日志。
- 新增定时任务 UI 时，直接读写 `ScheduledJob`，不要创建页面专属的旧任务 DTO 再在后台转换。
