<!-- context7 -->
Use Context7 MCP to fetch current documentation whenever the user asks about a library, framework, SDK, API, CLI tool, or cloud service -- even well-known ones like React, Next.js, Prisma, Express, Tailwind, Django, or Spring Boot. This includes API syntax, configuration, version migration, library-specific debugging, setup instructions, and CLI tool usage. Use even when you think you know the answer -- your training data may not reflect recent changes. Prefer this over web search for library docs.

Do not use for: refactoring, writing scripts from scratch, debugging business logic, code review, or general programming concepts.

## Steps

1. Always start with `resolve-library-id` using the library name and the user's question, unless the user provides an exact library ID in `/org/project` format
2. Pick the best match (ID format: `/org/project`) by: exact name match, description relevance, code snippet count, source reputation (High/Medium preferred), and benchmark score (higher is better). If results don't look right, try alternate names or queries (e.g., "next.js" not "nextjs", or rephrase the question). Use version-specific IDs when the user mentions a version
3. `query-docs` with the selected library ID and the user's full question (not single words)
4. Answer using the fetched docs
<!-- context7 -->

# 仓库协作指南

## 项目结构与模块组织

这是一个基于 WXT、React、TypeScript 和 Ant Design 构建的 Chrome Manifest V3 插件。

- `entrypoints/background.ts` 注册插件后台入口。
- `entrypoints/dashboard/` 包含后台管理页面的 HTML 和 React 启动代码。
- `entrypoints/taobao.content.tsx` 注册淘宝/天猫页面的通用 content script，承载发货助手、采购单读取、退款和商品采集等淘宝工作流。
- `src/App.tsx`、`src/main.tsx` 和 `src/index.css` 提供应用外壳和全局样式。
- `src/components/` 放置通用 UI，例如布局、统计卡片和账号弹窗。
- `src/pages/` 按业务域组织功能页面，包括 `orders`、`settings`、`store-management`、`product-listing`、`violation` 和 `common-functions`。
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
6. `src/background/store/`、`src/background/wxshop/` 和 `src/background/activity-logs/`：负责基础设施。

不要在 `handlers.ts` 中新增 switch 分支。新增功能时，应先在 `src/shared/runtime-channels.ts` 添加带类型的 channel，通过 `src/shared/extension-api.ts` 暴露，再在 `src/background/router/create-background-router.ts` 注册 runtime handler。

Runtime IPC 必须保持类型化。每个新增 channel 都必须添加到 `RuntimeChannels`，并显式声明 `args` 和 `result` 类型。前端代码应通过 `extensionApi` 调用 IPC，不要直接调用原始 `chrome.runtime.sendMessage`，已经由共享辅助方法封装的底层事件监听除外。

前端必须保持为意图表达层和结果渲染层。涉及业务数据的筛选、排序、聚合、派生状态、分页、权限判断、持久化写入和跨模块一致性规则时，应先抽象为共享类型和查询/命令参数，再由 background 的 router、runtime handler、service、domain 或 store 层统一执行。前端组件可以维护控件输入、弹窗开关、当前选中项等轻量 UI 状态，但不得在组件里对业务数据做权威重排、二次过滤、静默改写或维护另一套业务事实来源。页面拿到什么结构化数据就渲染什么；需要改变数据呈现时，应改变查询模型或后端领域模型，而不是在 UI 中临时补逻辑。

## 微信小店 API 与 Token 架构指南

微信小店后台接口必须通过统一 token 服务调用，不保留 client 内部 token 兼容入口。

- `src/background/wxshop/access-token-service.ts` 是 access token 生命周期的唯一入口，负责 `appid + secret` 换 token、内存缓存、`chrome.storage.local` 持久缓存、过期提前刷新、并发刷新去重、强制刷新和失效清理。
- `src/background/wxshop/client.ts` 只暴露微信小店业务接口，例如商品、订单、配额、发货、解密地址和快递公司列表。它不得暴露 `getAccessToken`、`clearTokenCache`、`config` 或其它 token/凭证相关入口。
- 新增微信小店接口时，只能在 `client.ts` 中通过统一 `request()` 封装声明 path、body 和返回值处理；不要在业务 service、runtime handler、scheduler executor 或 UI 中拼 `access_token`。
- 上层业务代码不得读取、传递、缓存或记录 access token，也不得为了日志或限速从微信 client 读取 `appId`。需要业务隔离 key 时使用 `accountId`。
- 账号配置新增、更新、删除时必须清理对应 token 缓存；校验配置时可以直接调用 `access-token-service` 强制刷新 token，但不要绕回 `WxShopClient`。
- token、appSecret 和任何微信敏感凭证都不得进入全局日志、模块日志、通知、错误详情或 UI 展示。

## 上货草稿与商品提审边界指南

上货管理和商品提审是两个不同业务域，不能因为微信底层接口名称相近而混用流程。

- 上货管理当前只允许创建微信小店草稿箱商品，业务命令必须使用 `DraftBox` 语义，例如 `prepareWxDraftBoxProduct`、`createPreparedWxDraftBoxProduct` 或 `createWxDraftBoxProduct`。
- 上货管理创建草稿箱时必须固定 `listing=0`，不得暴露 `autoListing`、`listing=1` 或“自动提审/上架”开关。
- 上货管理的草稿箱创建流程不得调用 `categoryprecheck`、`submitProductAudit`、`/channels/ec/product/listing` 或其它提审/上架门禁接口。草稿箱创建失败只能来自数据准备、图片上传、微信 `addProduct` 写草稿等草稿创建相关原因。
- 微信小店 `addProduct` 是底层接口名，不代表业务上架。业务 service、runtime channel、extension API 和前端按钮文案必须用明确业务命名区分“创建草稿箱商品”和“提交商品提审”。
- `categoryprecheck` 属于商品提审域的提审前诊断能力，应放在 `productAudit` 相关 service、runtime handler 和 IPC 中，例如 `productAudit:precheckCategory`。它可以用于提审前提示或诊断，但不得回流到上货草稿箱创建路径。
- 新增或修改这两类流程时，必须补测试锁住边界：上货草稿箱测试要断言不调用发品前校验且提交 `listing=0`；商品提审测试要单独覆盖预检、提审接口和失败策略。

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

后台异步写入前端会缓存的数据后，必须通知前端刷新。前端 TanStack Query 缓存只有两条失效来源：前端主动 mutation 的 `invalidateQueries` 回调，以及后台 runtime event 驱动的 `refetch`。只要数据写入不经过前端 mutation（例如订单同步、定时任务、内容脚本回填、备注提取、付款抓取等后台异步流程），就必须通过 `chrome.runtime.sendMessage({ type: 'event', event, payload })` 发一个明确事件，并在 `extensionApi` 暴露对应的 `onXxx` 监听器，让消费该数据的页面 hook 失效或 refetch 对应 query。新增任何后台写入路径时，要确认这条写入在 UI 上能看到结果；如果 UI 看不到，说明缓存闭环没走完。不要只在存储层落库就认为任务完成。

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

淘宝商品采集的专门设计说明见 `docs/taobao-product-collection-agent-guide.md`。修改上货模块、商品详情采集、淘宝页面模型读取或详情图采集前，AI agent 必须先阅读该文档，并按文档要求用真实登录页面验证结构变化。

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

- Chrome 目标开发和测试统一使用 `npm run dev` 启动的 WXT 开发浏览器。该浏览器必须固定使用仓库内 `wxt-chrome-data` 作为 Chrome `user-data-dir`，并固定开放 Chrome DevTools Protocol 端口 `127.0.0.1:19222` 供自动化测试和排查连接。不要再使用随机 WXT profile、`.wxt/chrome-profile`、`127.0.0.1:9222` 或日常真实 Chrome 执行插件联调，除非用户明确要求切换。
- 淘宝/天猫登录态只维护在 `wxt-chrome-data` 里。遇到淘宝要求登录时，应先确认当前连接的是 `127.0.0.1:19222` 对应的 WXT 开发浏览器，不要误读其它 Chrome 实例。
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

## 交付前自检

完成一个任务或一组关联改动、准备交付前，必须自己重新 review 一遍全部改动，确认逻辑正确、边界处理完整、与架构规则一致，再向用户报告完成。不得把"能编译、能跑"等同于"完成"。

## 安全与配置提示

不要提交真实 app 凭证、access token 或客户数据。账号配置和微信 API 客户端值都应视为敏感信息。新增 `wxt.config.ts` host permissions 时保持范围尽量窄，并在 PR 中解释权限变化。

## 工作台日志中心指南

工作台日志中心是用户可读业务活动与通知的唯一入口。日志模块和通知模块不是两套系统；通知只是 ActivityLog 里带有 `notification` 意图的派生视图。

- 共享业务活动日志类型位于 `src/shared/activity-log.ts`。
- 共享通知类型位于 `src/shared/notification.ts`。
- 后台 ActivityLog 基础设施位于 `src/background/activity-logs/`。
- 后台诊断日志基础设施位于 `src/background/logging/`。
- 通知持久化、已读、清空和偏好管理位于 `src/background/notification-center/`，但业务代码不得直接调用通知中心生成通知。
- UI 通过 `src/hooks/useActivityLogs.ts`、`src/components/ActivityLogDrawer.tsx` 和 `src/components/NotificationCenter.tsx` 展示日志与通知。

ActivityLog 只有一个事实入口：`src/background/activity-logs/activity-log-service.ts`。业务模块必须通过 `recordActivity`、`recordActivityStarted`、`recordActivityCompleted`、`recordActivitySkipped`、`recordActivityFailed`、`recordActivityWaitingUser` 或 `createActivityRecorder` 写用户可读业务活动；不要在业务代码中直接写 `chrome.storage.local.activityLogs`、`notifications` 或其它日志/通知存储。

日志分两类：

1. ActivityLog：记录用户或系统应该知道的结构化事实，例如任务开始、完成、失败、等待用户处理、授权失效、配额耗尽和重要任务摘要。ActivityLog 会进入页面日志中心，并自动镜像到 Service Worker 控制台。
2. DiagnosticLogger：记录开发排查需要的运行细节，例如接口请求参数、时间窗口、返回数量、账号处理进度、页面读取结果和异常堆栈。诊断日志必须通过 `createDiagnosticLogger({ domain, component, accountId })` 写入，只输出到 Service Worker 控制台，不进入页面日志中心，不触发通知。

后台完整日志查看规则：

1. 用户日常只看页面右下角“日志中心”，那里只展示 ActivityLog。
2. 开发排查后台完整过程只看 Chrome 扩展的 Service Worker 控制台，那里同时包含 ActivityLog 镜像和 DiagnosticLogger 细节。
3. `npm run dev` 终端只看 WXT 启动、编译、热更新和构建错误，不承担业务日志观察职责。
4. React 页面控制台只排查后台管理页 UI 问题。

通知规则：

1. 通知不是独立入口，只能从 ActivityLog 派生。
2. 只有 ActivityLog entry 显式带 `notification.topic` 时，才会进入通知视图；没有 `notification` 的 ActivityLog 永远只作为日志展示。
3. 普通 `started`、`completed`、`skipped`、`failed`、`warning` 或 `error` 级别本身都不自动生成通知。
4. 不允许在调度中心、业务 service、runtime handler 或 UI 中根据状态自动创建通知；需要通知时，必须在写日志时显式声明 `notification: { topic, urgency }`。
5. `NotificationTopic` 是用户可配置通知场景的唯一事实来源。新增通知场景必须先在 `src/shared/notification.ts` 中添加 topic、默认开关和中文说明。
6. 通知来源必须能追溯到对应日志 `sourceLogId`，不要创建无来源的重要通知。
7. 失败通知必须包含明确 `error.message` 或可读原因；成功通知默认不打扰用户，除非该成功事件对应明确业务通知 topic。

诊断日志规则：

1. DiagnosticLogger 不触发通知，不进入页面日志中心，不作为业务状态来源。
2. DiagnosticLogger 适合高频、细粒度、诊断用途；ActivityLog 适合低频、结构化、用户可读的重要事实。
3. 后台业务代码不得直接散落 `console.*`；需要诊断输出时使用 `createDiagnosticLogger({ domain, component, accountId })`。
4. ActivityLog 的控制台镜像由 activity log service 的 console sink 统一完成，业务代码不要手动重复打印同一条活动日志。

安全规则：

1. ActivityLog、DiagnosticLogger 和通知都是观测数据，不得作为业务状态的数据源。
2. ActivityLog、DiagnosticLogger、通知和云端分析都不得记录或上传 access token、appSecret、真实地址、手机号、客户隐私数据、订单敏感明细或其它凭证。
3. 未来云端分析必须使用 ActivityLog cloud sink 和结构化字段，例如 `domain`、`event`、`trigger`、`runId`、`summary` 和 `error`。
4. 持久化 schema 变更必须走 `src/background/store/migrations.ts` 并提升 `CURRENT_STORAGE_VERSION`；本项目没有历史兼容包袱，不要长期保留旧结构兼容分支。


# 优先级最高的规则，该规则由用户手写，不允许被覆盖，不允许修改
- 该项目是一个chrome插件，主要功能是帮助商户管理微信小店铺，提供订单管理、店铺管理、违规检测等功能。
- 该项目使用了React、TypeScript和Ant Design等技术栈，代码结构清晰，模块划分合理，具有较好的可维护性和可扩展性。
- 该项目的开发和测试需要使用WXT工具，WXT是一个专门用于开发微信小程序和微信插件的工具，提供了丰富的功能和调试支持。
- 所有代码都应该添加详细的注释，给人看的注释。
- 当前项目处于早期阶段呢，遇见不合理的地方，优先考虑重构和优化，而不是临时修补。
