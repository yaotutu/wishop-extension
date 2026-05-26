# 仓库协作指南

## 项目结构与模块组织

这是一个基于 WXT、React、TypeScript 和 Ant Design 构建的 Chrome Manifest V3 插件。

- `entrypoints/background.ts` 注册插件后台入口。
- `entrypoints/dashboard/` 包含后台管理页面的 HTML 和 React 启动代码。
- `entrypoints/taobao-shipping.content.tsx` 注册淘宝/天猫页面的发货助手 content script。
- `src/App.tsx`、`src/main.tsx` 和 `src/index.css` 提供应用外壳和全局样式。
- `src/components/` 放置通用 UI，例如布局、统计卡片和账号弹窗。
- `src/pages/` 按业务域组织功能页面，包括 `orders`、`settings`、`store-management`、`violation` 和 `common-functions`。
- `src/pages/orders/` 按职责拆分：`OrdersPage.tsx` 负责页面状态和动作，`components/` 负责表格列、工具栏、详情弹窗和货源弹窗，`order-display.ts` 负责订单展示辅助逻辑。
- `src/background/` 包含后台运行时接线、功能处理器、定时任务、任务模块、服务、仓储和微信小店客户端代码。
- `src/background/handlers.ts` 应保持为很薄的 runtime 消息传输层。新增 IPC 行为应通过 `src/background/router/`、`src/background/runtime-handlers/` 和 `src/background/services/` 实现。
- `src/background/scheduler/` 是统一定时任务中心。新增定时任务只能通过这里注册执行器，不要在业务模块里单独创建 `chrome.alarms`、`setInterval` 或其它散落的定时循环。
- `src/background/store/` 包含存储仓储。`src/background/store.ts` 仅保留为兼容导出层；新的后台代码应直接导入具体仓储。
- `src/content/taobao/` 包含淘宝/天猫页面读取、自动化适配器、content runtime 和注入 UI。页面读取能力应按 `dom/`、`adapters/`、`runtime/` 和 UI 组件分层组织。
- `src/hooks/`、`src/contexts/` 和 `src/shared/` 放置可复用 hook、Provider、共享类型、错误和 IPC 辅助方法。
- `src/shared/runtime-channels.ts` 是 runtime IPC channel 参数和返回值类型的唯一事实来源。
- `public/` 和 `assets/` 存放插件静态资源和图标。

## 架构指南

后台代码按以下层次组织：

1. `src/background/handlers.ts`：只负责 runtime 消息监听。
2. `src/background/router/`：负责 channel 注册、功能鉴权入口和分发。
3. `src/background/runtime-handlers/`：负责 IPC 参数适配和功能级入口。
4. `src/background/services/`：负责业务流程，例如草稿商品获取、订单查询、任务执行和违规扫描。
5. `src/background/modules/`：负责更底层的任务算法。
6. `src/background/store/`、`src/background/wxshop/` 和 `src/background/global-logs/`：负责基础设施。

不要在 `handlers.ts` 中新增 switch 分支。新增功能时，应先在 `src/shared/runtime-channels.ts` 添加带类型的 channel，通过 `src/shared/extension-api.ts` 暴露，再在 `src/background/router/create-background-router.ts` 注册 runtime handler。

Runtime IPC 必须保持类型化。每个新增 channel 都必须添加到 `RuntimeChannels`，并显式声明 `args` 和 `result` 类型。前端代码应通过 `extensionApi` 调用 IPC，不要直接调用原始 `chrome.runtime.sendMessage`，已经由共享辅助方法封装的底层事件监听除外。

## 微信小店 API 与 Token 架构指南

微信小店后台接口必须通过统一 token 服务调用，不保留 client 内部 token 兼容入口。

- `src/background/wxshop/access-token-service.ts` 是 access token 生命周期的唯一入口，负责 `appid + secret` 换 token、内存缓存、`chrome.storage.local` 持久缓存、过期提前刷新、并发刷新去重、强制刷新和失效清理。
- `src/background/wxshop/client.ts` 只暴露微信小店业务接口，例如商品、订单、配额、发货、解密地址和快递公司列表。它不得暴露 `getAccessToken`、`clearTokenCache`、`config` 或其它 token/凭证相关入口。
- 新增微信小店接口时，只能在 `client.ts` 中通过统一 `request()` 封装声明 path、body 和返回值处理；不要在业务 service、runtime handler、scheduler executor 或 UI 中拼 `access_token`。
- 上层业务代码不得读取、传递、缓存或记录 access token，也不得为了日志或限速从微信 client 读取 `appId`。需要业务隔离 key 时使用 `accountId`。
- 账号配置新增、更新、删除时必须清理对应 token 缓存；校验配置时可以直接调用 `access-token-service` 强制刷新 token，但不要绕回 `WxShopClient`。
- token、appSecret 和任何微信敏感凭证都不得进入全局日志、模块日志、通知、错误详情或 UI 展示。

## 定时任务中心指南

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

存储使用 `chrome.storage.local`，并通过版本化 migration 管理。持久化数据迁移放在 `src/background/store/migrations.ts`，变更持久化 schema 时同步提升 `src/background/store/core.ts` 中的 `CURRENT_STORAGE_VERSION`。不要在 UI 组件或无关 service 中静默改写已持久化的账号数据结构。

前端异步业务数据应使用 TanStack Query。Query key 放在 `src/query/` 下，页面 hook 在 mutation 后应通过失效或更新 query data 来刷新数据，不要在组件 state 中维护重复的业务数据副本。持久化业务状态仍以后端 background repository 为准；Query 只是前端缓存。

Zustand 只用于轻量 UI 状态和用户偏好，例如悬浮工具栏位置、折叠状态、选中的 tab 和视图偏好。不要把订单、真实地址、采购单详情、凭证或其它持久化业务数据放入 Zustand。

`wxt.config.ts` 中的 host permissions 应继续集中在 `HOST_PERMISSIONS`，并用注释说明每个域名权限对应的用户功能。优先保证商家工作流使用方便，但不要添加无法解释的宽泛权限。

## 发货助手指南

订单发货流程基于会话：

- 后台管理页的订单动作通过后台 IPC 创建短生命周期的 `ShippingSession`。
- 后台打开淘宝/天猫标签页，并将 `tabId` 绑定到该会话。
- Content script 从后台请求当前会话并挂载工具栏。
- Content script 不得读取微信凭证，也不得直接调用微信接口。

淘宝/天猫 DOM 访问应放在 `src/content/taobao/` 的适配器后面。选择器和页面识别逻辑不要写进工具栏组件。后续自动化能力应先在适配器中添加稳定的方法，例如 `detect`、`read`、`fill` 和 `validate`，再改 UI 代码。

## 淘宝页面读取架构指南

后续会有大量能力依赖淘宝/天猫页面元素读取。此类能力必须作为 content 子系统维护，不要把 DOM 解析、业务流程和浮层 UI 混在一起。

`src/content/taobao/` 按以下职责组织：

- `dom/`：只放通用页面读取工具，例如文本归一化、label/value 读取、精确文本匹配、等待元素、DOM 诊断快照。这里不得调用后台 IPC，不得包含业务流程。
- `adapters/`：按淘宝页面类型输出结构化数据，例如订单详情页、商品详情页、已买到宝贝列表页、物流页、下单确认页。adapter 可以读取 DOM，但不得保存数据、不得直接调用 `extensionApi`、不得渲染 UI。
- `runtime/`：负责 content script 的运行时接线，例如会话解析、重试、页面关闭保护、Shadow DOM 挂载和 workflow 调度。
- UI 组件：只展示状态、触发动作和显示用户提示。组件不得直接写复杂选择器或页面识别逻辑。

新增淘宝页面读取功能时，优先按以下流程落地：

1. 先在 `dom/` 补充可复用读取工具。
2. 再在 `adapters/` 为目标页面新增稳定的 `detect`、`read`、`fill` 或 `validate` 方法，并返回明确的结构化类型。
3. 然后在 `runtime/` 或对应 workflow 中处理会话、重试、错误和 IPC。
4. 最后让 UI 组件消费结构化结果，不直接依赖淘宝 DOM。

淘宝页面选择器必须保守。不要使用宽泛选择器作为权威字段，例如 `[class*="status"]`、`[class*="logistics"]` 这类选择器容易命中大容器、地址块或无关区域。优先使用：

- 精确文本节点，例如 `买家已付款`、`卖家已发货`、`交易成功`。
- 明确 label，例如 `订单编号`、`物流公司`、`快递公司`、`运单号`、`快递单号`。
- 已知 URL/session 参数，例如淘宝订单详情页的 `biz_order_id`。
- 限定在稳定页面区域内的小节点读取，而不是从整页文本中截取。

当真实淘宝页面读取结果异常时，应先用真实登录浏览器诊断 DOM，再改 adapter。若 WXT 同时启动了开发 Chrome，要先区分真实用户 Chrome 和 WXT Chrome，避免读到无登录态或无窗口实例。可参考本地记忆 `/Users/yaotutu/.codex/memories/wishop-browser-debugging.md` 中的真实 Chrome 连接方式。

淘宝/天猫后台读取任务应复用一个专用工作标签页。后台负责创建或复用该标签页，并按队列串行执行读取任务，避免后一个任务导航页面时打断前一个任务。用户不应被强制跳转到新标签页；只有遇到登录、滑块、验证码、安全验证或访问受限时，才主动激活该工作页并通过插件通知、页面消息提醒用户处理。

验证识别逻辑应放在 `src/content/taobao/adapters/security-challenge-adapter.ts` 这类 adapter 中，综合 URL、标题、页面文本、iframe、id 和 class 信号判断。UI 组件只消费结构化的 challenge 结果并触发后台 IPC，不要直接散落验证关键词判断。

## 鉴权指南

鉴权结构已经存在，但在服务端准备好之前，鉴权拦截保持关闭。

- 共享鉴权类型位于 `src/shared/types.ts`。
- 本地鉴权持久化位于 `src/background/store/license-repository.ts`。
- 鉴权业务逻辑位于 `src/background/licensing/licensing-service.ts`。
- 鉴权 IPC 位于 `src/background/runtime-handlers/license-handlers.ts`。
- 路由层功能门控位于 `src/background/router/create-background-router.ts` 和 `src/background/router/runtime-router.ts`。
- 设置页有授权状态面板，但 `enforcementEnabled` 默认是 `false`。

在后端实现并且项目负责人明确开启拦截之前，不要用鉴权检查阻断用户工作流。新的付费能力仍应映射到 router feature map 中的 `LicensedFeature`，这样后续开启鉴权时不需要重做各个模块。

## 构建、测试与开发命令

- `npm install` 安装依赖并运行 `wxt prepare`。
- `npm run dev` 启动 Chrome 目标的 WXT 开发服务器。
- `npm run dev:firefox` 启动 Firefox 目标的开发模式。
- `npm run compile` 运行 `tsc --noEmit` 做 TypeScript 校验。
- `npm run build` 构建 Chrome 插件包。
- `npm run build:firefox` 构建 Firefox 版本。
- `npm run zip` 和 `npm run zip:firefox` 创建可分发的插件压缩包。

## 开发 Reload 指南

Chrome 扩展开发时，dashboard 页面和 background service worker 可能不同步。修改范围决定是否需要刷新页面、重新加载插件或重启 dev server：

- 只改 React 页面、样式、普通前端 hook：通常刷新 dashboard 页面即可。
- 改 `src/background/`、`entrypoints/background.ts`、runtime IPC、`src/shared/runtime-channels.ts`、`src/shared/extension-api.ts`、store migration、scheduler、微信小店 client：需要重新加载插件。
- 改 content script、content adapter、content runtime：需要重新加载插件，并重新打开目标网页标签页。
- 改 `wxt.config.ts`、manifest、permissions、依赖、入口文件匹配规则：需要重启 `npm run dev`，然后重新加载插件。
- 开发环境中如果前台 IPC 收到 `Unknown runtime channel`，`extensionApi` 会自动调用 `chrome.runtime.reload()` 重新加载插件；这表示前台 bundle 已更新但后台 service worker 仍是旧版本。
- Codex 修改了需要插件 reload 的文件后，应主动完成 reload 或明确说明已触发自动 reload，不要把判断成本留给用户。

## 代码风格与命名规范

使用 TypeScript 模块、ES imports 和 React 函数组件。保持两个空格缩进、单引号和分号。React 组件使用 `PascalCase` 命名，例如 `OrdersPage.tsx`；hook 使用 `use` 前缀，例如 `useOrders.ts`；后台模块使用描述性的 kebab-case 文件名，例如 `violation-detect.ts`。IPC channel 字符串应按功能命名空间组织，例如 `accounts:list` 或 `scheduledJobs:update`。

## 测试指南

当前 `package.json` 没有配置自动化测试框架。每次修改后运行 `npm run compile`；涉及 background、manifest 或打包行为的修改，还要运行 `npm run build`。新增测试时，可以与功能代码放在一起，也可以放到专门的 `tests/` 目录。测试文件优先使用 `*.test.ts` 或 `*.test.tsx` 命名。

## 提交与 PR 指南

使用简短的祈使句提交信息，例如 `Add scheduler quota validation` 或 `Fix order search pagination`。

PR 应包含清晰摘要、验证命令、关联 issue 或任务背景，以及 UI 变更对应的截图或录屏。涉及权限、manifest 或 API 行为变化时，需要明确说明。

## 安全与配置提示

不要提交真实 app 凭证、access token 或客户数据。账号配置和微信 API 客户端值都应视为敏感信息。新增 `wxt.config.ts` host permissions 时保持范围尽量窄，并在 PR 中解释权限变化。

## 工作台日志中心指南

工作台日志中心是全局唯一的日志与通知入口。日志模块和通知模块不是两套系统；通知只是日志中心里带有 `notification` 意图的日志视图。

- 共享日志类型位于 `src/shared/global-log.ts`。
- 共享通知类型位于 `src/shared/notification.ts`。
- 后台日志基础设施位于 `src/background/global-logs/`。
- 通知持久化、已读、清空和偏好管理位于 `src/background/notification-center/`，但业务代码不得直接调用通知中心生成通知。
- UI 通过 `src/hooks/useGlobalLogs.ts`、`src/components/GlobalLogDrawer.tsx` 和 `src/components/NotificationCenter.tsx` 展示日志与通知。

日志中心只有一个事实入口：`src/background/global-logs/global-log-service.ts`。业务模块必须通过 `recordGlobalLog`、`recordTaskStarted`、`recordTaskCompleted`、`recordTaskSkipped`、`recordTaskFailed`、`recordTaskWaitingUser` 等封装写日志；不要在业务代码中直接写 `chrome.storage.local.globalLogs`、`notifications` 或其它日志/通知存储。

日志分两类视图：

1. 业务事件日志：记录用户或系统应该知道的结构化事实，例如任务开始、完成、失败、等待用户处理、授权失效、配额耗尽和重要任务摘要。
2. 控制台诊断日志：记录排查问题需要的运行细节，例如接口请求参数、时间窗口、返回数量、账号处理进度、页面读取结果和异常堆栈。控制台日志应通过日志模块的 `createLogger(...)` 或后续统一 logger API 写入，不能只写 `console.*` 导致工作台不可见。

通知规则：

1. 通知不是独立入口，只能从日志派生。
2. 只有日志 entry 显式带 `notification.topic` 时，才会进入通知视图；没有 `notification` 的日志永远只作为日志展示。
3. 普通 `started`、`completed`、`skipped`、`failed`、`warning` 或 `error` 级别本身都不自动生成通知。
4. 不允许在调度中心、业务 service、runtime handler 或 UI 中根据状态自动创建通知；需要通知时，必须在写日志时显式声明 `notification: { topic, urgency }`。
5. `NotificationTopic` 是用户可配置通知场景的唯一事实来源。新增通知场景必须先在 `src/shared/notification.ts` 中添加 topic、默认开关和中文说明。
6. 通知来源必须能追溯到对应日志 `sourceLogId`，不要创建无来源的重要通知。
7. 失败通知必须包含明确 `error.message` 或可读原因；成功通知默认不打扰用户，除非该成功事件对应明确业务通知 topic。

控制台日志规则：

1. 控制台日志属于日志中心，不触发通知。
2. 控制台日志要能在工作台查看，不能只依赖 background service worker DevTools 的 `console.*`。
3. 控制台日志适合高频、细粒度、诊断用途；业务事件日志适合低频、结构化、用户可读的重要事实。
4. 控制台日志必须支持按模块、账号、级别、关键词和时间筛选。
5. 控制台日志需要有限保留，例如保留最近 1000/2000 条或最近 7 天，不能无限增长。

安全规则：

1. 日志和通知都是观测数据，不得作为业务状态的数据源。
2. 日志、控制台日志、通知和云端分析都不得记录或上传 access token、appSecret、真实地址、手机号、客户隐私数据、订单敏感明细或其它凭证。
3. 未来云端分析必须使用日志中心 cloud sink 和结构化字段，例如 `module`、`eventType`、`taskKind`、`runId`、`summary` 和 `error`。
4. 持久化 schema 变更必须走 `src/background/store/migrations.ts` 并提升 `CURRENT_STORAGE_VERSION`；本项目没有历史兼容包袱，不要长期保留旧结构兼容分支。


# 优先级最高的规则，该规则由用户手写，不允许被覆盖，不允许修改
- 该项目是一个chrome插件，主要功能是帮助商户管理微信小店铺，提供订单管理、店铺管理、违规检测等功能。
- 该项目使用了React、TypeScript和Ant Design等技术栈，代码结构清晰，模块划分合理，具有较好的可维护性和可扩展性。
- 该项目的开发和测试需要使用WXT工具，WXT是一个专门用于开发微信小程序和微信插件的工具，提供了丰富的功能和调试支持。
