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
- `src/background/store/` 包含存储仓储。`src/background/store.ts` 仅保留为兼容导出层；新的后台代码应直接导入具体仓储。
- `src/content/taobao/` 包含淘宝/天猫页面适配器和注入的发货助手 UI。
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

## 代码风格与命名规范

使用 TypeScript 模块、ES imports 和 React 函数组件。保持两个空格缩进、单引号和分号。React 组件使用 `PascalCase` 命名，例如 `OrdersPage.tsx`；hook 使用 `use` 前缀，例如 `useOrders.ts`；后台模块使用描述性的 kebab-case 文件名，例如 `violation-detect.ts`。IPC channel 字符串应按功能命名空间组织，例如 `accounts:list` 或 `scheduler:update`。

## 测试指南

当前 `package.json` 没有配置自动化测试框架。每次修改后运行 `npm run compile`；涉及 background、manifest 或打包行为的修改，还要运行 `npm run build`。新增测试时，可以与功能代码放在一起，也可以放到专门的 `tests/` 目录。测试文件优先使用 `*.test.ts` 或 `*.test.tsx` 命名。

## 提交与 PR 指南

使用简短的祈使句提交信息，例如 `Add scheduler quota validation` 或 `Fix order search pagination`。

PR 应包含清晰摘要、验证命令、关联 issue 或任务背景，以及 UI 变更对应的截图或录屏。涉及权限、manifest 或 API 行为变化时，需要明确说明。

## 安全与配置提示

不要提交真实 app 凭证、access token 或客户数据。账号配置和微信 API 客户端值都应视为敏感信息。新增 `wxt.config.ts` host permissions 时保持范围尽量窄，并在 PR 中解释权限变化。

## 全局日志中心指南

全局日志中心是结构化任务事件流，不是通用 debug 日志，也不是产品级明细日志。

- 共享全局日志类型位于 `src/shared/global-log.ts`。
- 后台全局日志基础设施位于 `src/background/global-logs/`。
- UI 通过 `src/hooks/useGlobalLogs.ts` 读取全局日志，并在 `src/components/GlobalLogDrawer.tsx` 中展示。
- 业务模块必须通过 `src/background/global-logs/global-log-service.ts` 写入全局日志；不要在业务代码中直接写 `chrome.storage.local.globalLogs`。
- 当前 sink 包括本地存储、runtime 事件通知和预留的云上传 sink。云上传失败绝不能阻断业务任务。

全局日志适用于：

- 自动化任务，例如定时任务和全账号任务。
- 用户离开当前页面后仍可能完成的后台任务。
- 重要的前台任务，包括用户后续需要回看结果的手动任务。
- 任务级 started、completed、skipped 和 failed 事件。

全局日志不适用于：

- 单商品、单订单或单 API 调用的明细记录。
- 高频循环条目。循环内部如需细节，应写账号日志，然后在循环结束后写一条全局摘要。
- debug 输出或内部开发跟踪。

全局日志规则：

1. 账号级明细日志保留在账号日志中，例如 `accounts[].logs`。
2. 全局日志记录重要操作运行及其结果。
3. 重要手动任务也应写入全局日志。
4. 失败、跳过和异常任务结果必须能在全局日志中心看到。
5. 全局日志只是观测数据，不得作为业务状态的数据源。
6. 清空全局日志不得清空账号日志。
7. 未来云端分析必须使用 cloud sink 和结构化字段，例如 `module`、`eventType`、`taskKind`、`runId`、`summary` 和 `error`；不得上传凭证、token、客户数据或敏感的订单、地址、商品明细。


# 优先级最高的规则，该规则由用户手写，不允许被覆盖，不允许修改
- 该项目是一个chrome插件，主要功能是帮助商户管理微信小店铺，提供订单管理、店铺管理、违规检测等功能。
- 该项目使用了React、TypeScript和Ant Design等技术栈，代码结构清晰，模块划分合理，具有较好的可维护性和可扩展性。
- 该项目的开发和测试需要使用WXT工具，WXT是一个专门用于开发微信小程序和微信插件的工具，提供了丰富的功能和调试支持。
