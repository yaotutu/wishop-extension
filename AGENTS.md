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

本文档只保留每次开发都用得上的全局规则。各业务域的详细架构规则按需阅读，修改对应模块前先看「## 领域规则索引」。

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

## 领域规则索引

修改以下模块前，先读对应领域文档：

- 后端分层、runtime IPC 类型化、前端意图层、存储与 TanStack Query 缓存闭环、Zustand、host permissions → `.agents/guides/architecture.md`
- 微信小店接口调用、access token 生命周期、`client.ts` 边界 → `.agents/guides/wxshop-token.md`
- 上货草稿箱 vs 商品提审边界、`listing=0` 门禁、`categoryprecheck` 归属 → `.agents/guides/listing-vs-audit.md`
- 定时任务、`ScheduledJob`、调度中心、executor 注册 → `.agents/guides/scheduler.md`
- 淘宝/天猫页面读取、`src/content/taobao/` 分层、选择器保守原则、工作标签页、安全验证 → `.agents/guides/taobao-reading.md`
- 发货助手会话流程、`ShippingSession`、content 工具栏 → `.agents/guides/shipping.md`
- 工作台日志中心、ActivityLog / DiagnosticLogger / 通知规则、日志安全 → `.agents/guides/logging.md`
- 鉴权门控、`LicensedFeature` 映射（默认关闭） → `.agents/guides/licensing.md`

## 领域文档维护规则

新增一个有独立边界条件的业务域时，必须同步落地一份领域文档，不要把域规则写回总纲：

1. 在 `.agents/guides/` 下新建一个 kebab-case 文件，例如 `refund-flow.md`。
2. 文件顶部一行写明适用范围（「改 X 时必读」），正文只放该域的边界条件、禁止项和必经流程。
3. 在上面的「领域规则索引」补一条，用一句话写清该文档覆盖什么、什么改动触发阅读。
4. 总纲只保留全局通用规则。某条规则只在改特定模块时才需要，就属于领域文档，不属于总纲。

判断一条规则该进总纲还是领域文档的依据：改订单管理时是否也得遵守它。是 → 总纲；否 → 领域文档。

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


## 交付前自检

完成一个任务或一组关联改动、准备交付前，必须自己重新 review 一遍全部改动，确认逻辑正确、边界处理完整、与架构规则一致，再向用户报告完成。不得把"能编译、能跑"等同于"完成"。

## 安全与配置提示

不要提交真实 app 凭证、access token 或客户数据。账号配置和微信 API 客户端值都应视为敏感信息。新增 `wxt.config.ts` host permissions 时保持范围尽量窄，并在 PR 中解释权限变化。

# 优先级最高的规则，该规则由用户手写，不允许被覆盖，不允许修改
- 该项目是一个chrome插件，主要功能是帮助商户管理微信小店铺，提供订单管理、店铺管理、违规检测等功能。
- 该项目使用了React、TypeScript和Ant Design等技术栈，代码结构清晰，模块划分合理，具有较好的可维护性和可扩展性。
- 该项目的开发和测试需要使用WXT工具，WXT是一个专门用于开发微信小程序和微信插件的工具，提供了丰富的功能和调试支持。
- 所有代码都应该添加详细的注释，给人看的注释。
- 当前项目处于早期阶段呢，遇见不合理的地方，优先考虑重构和优化，而不是临时修补。
