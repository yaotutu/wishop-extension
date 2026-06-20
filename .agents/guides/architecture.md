# 架构指南

> 改 `src/background/`、`src/shared/`、前端页面或任何 runtime IPC 时必读。

后台代码按以下层次组织：

1. `src/background/handlers.ts`：只负责 runtime 消息监听。
2. `src/background/router/`：负责 channel 注册、功能鉴权入口和分发。
3. `src/background/runtime-handlers/`：负责 IPC 参数适配和功能级入口。
4. `src/background/services/`：负责业务流程，例如草稿商品获取、订单查询、任务执行和违规扫描。
5. `src/background/modules/`：负责更底层的任务算法。
6. `src/background/store/`、`src/background/wxshop/` 和 `src/background/activity-logs/`：负责基础设施。

不要在 `handlers.ts` 中新增 switch 分支。新增功能时，应先在 `src/shared/runtime-channels.ts` 添加带类型的 channel，通过 `src/shared/extension-api.ts` 暴露，再在 `src/background/router/create-background-router.ts` 注册 runtime handler。

Runtime IPC 必须保持类型化。每个新增 channel 都必须添加到 `RuntimeChannels`，并显式声明 `args` 和 `result` 类型。前端代码应通过 `extensionApi` 调用 IPC，不要直接调用原始 `chrome.runtime.sendMessage`，已经由共享辅助方法封装的底层事件监听除外。

前端必须保持为意图表达层和结果渲染层。涉及业务数据的筛选、排序、聚合、派生状态、分页、权限判断、持久化写入和跨模块一致性规则时，应先抽象为共享类型和查询/命令参数，再由 background 的 router、runtime handler、service、domain 或 store 层统一执行。前端组件可以维护控件输入、弹窗开关、当前选中项等轻量 UI 状态，但不得在组件里对业务数据做权威重排、二次过滤、静默改写或维护另一套业务事实来源。页面拿到什么结构化数据就渲染什么；需要改变数据呈现时，应改变查询模型或后端领域模型，而不是在 UI 中临时补逻辑。

## 存储与前端缓存

存储使用 `chrome.storage.local`，并通过版本化 migration 管理。持久化数据迁移放在 `src/background/store/migrations.ts`，变更持久化 schema 时同步提升 `src/background/store/core.ts` 中的 `CURRENT_STORAGE_VERSION`。不要在 UI 组件或无关 service 中静默改写已持久化的账号数据结构。

前端异步业务数据应使用 TanStack Query。Query key 放在 `src/query/` 下，页面 hook 在 mutation 后应通过失效或更新 query data 来刷新数据，不要在组件 state 中维护重复的业务数据副本。持久化业务状态仍以后端 background repository 为准；Query 只是前端缓存。

后台异步写入前端会缓存的数据后，必须通知前端刷新。前端 TanStack Query 缓存只有两条失效来源：前端主动 mutation 的 `invalidateQueries` 回调，以及后台 runtime event 驱动的 `refetch`。只要数据写入不经过前端 mutation（例如订单同步、定时任务、内容脚本回填、备注提取、付款抓取等后台异步流程），就必须通过 `chrome.runtime.sendMessage({ type: 'event', event, payload })` 发一个明确事件，并在 `extensionApi` 暴露对应的 `onXxx` 监听器，让消费该数据的页面 hook 失效或 refetch 对应 query。新增任何后台写入路径时，要确认这条写入在 UI 上能看到结果；如果 UI 看不到，说明缓存闭环没走完。不要只在存储层落库就认为任务完成。

Zustand 只用于轻量 UI 状态和用户偏好，例如悬浮工具栏位置、折叠状态、选中的 tab 和视图偏好。不要把订单、真实地址、采购单详情、凭证或其它持久化业务数据放入 Zustand。

`wxt.config.ts` 中的 host permissions 应继续集中在 `HOST_PERMISSIONS`，并用注释说明每个域名权限对应的用户功能。优先保证商家工作流使用方便，但不要添加无法解释的宽泛权限。
