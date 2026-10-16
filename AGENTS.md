# 仓库协作指南

📌 **指南维护约定**：本文件是全局总控，**只**保留"改任何模块都得遵守"的通用规则。新增复杂业务模块或引入新工作流时，**不要**把详细说明堆砌在本文件——请在 `docs/ai_guides/` 下新建 kebab-case 说明文档，并在文末「## 子模块指南索引」补一条触发条件。判断一条规则该进总纲还是子文档的依据：**改订单管理时是否也得遵守它。是 → 总纲；否 → 子文档。**

<!-- context7 -->
Use Context7 MCP to fetch current documentation whenever the user asks about a library, framework, SDK, API, CLI tool, or cloud service -- even well-known ones like React, Next.js, Prisma, Express, Tailwind, Django, or Spring Boot. This includes API syntax, configuration, version migration, library-specific debugging, setup instructions, and CLI tool usage. Use even when you think you know the answer -- your training data may not reflect recent changes. Prefer this over web search for library docs.

Do not use for: refactoring, writing scripts from scratch, debugging business logic, code review, or general programming concepts.

## Steps

1. Always start with `resolve-library-id` using the library name and the user's question, unless the user provides an exact library ID in `/org/project` format
2. Pick the best match (ID format: `/org/project`) by: exact name match, description relevance, code snippet count, source reputation (High/Medium preferred), and benchmark score (higher is better). If results don't look right, try alternate names or queries (e.g. "next.js" not "nextjs", or rephrase the question). Use version-specific IDs when the user mentions a version
3. `query-docs` with the selected library ID and the user's full question (not single words)
4. Answer using the fetched docs
<!-- context7 -->

## 项目概览

Chrome Manifest V3 插件，帮助商户管理微信小店铺，提供订单管理、店铺管理、商品合规扫描、复制上货、定时任务等能力。技术形态分三块：background service worker（后台逻辑 + 微信小店/淘宝对接）、dashboard（React 管理页）、content scripts（注入淘宝/天猫页面做采集与自动化）。

## 核心技术栈基准

生成代码时不得偏离以下基线：

- **构建/框架**：WXT（Manifest V3）+ TypeScript
- **前端 UI**：React + Ant Design
- **状态**：Zustand（轻量 UI/偏好）+ TanStack Query（服务端状态与缓存）
- **后台持久化**：`chrome.storage.local`（配置）+ Dexie/IndexedDB（索引类大数据）
- **IPC**：`src/shared/runtime-channels.ts` 是 channel 参数与返回值类型的唯一事实来源
- **测试**：Node.js 内置 `node:test`，文件放 `tests/`

> 各技术栈的详细分层与边界条件见文末「## 子模块指南索引」。

## 全局编码风格与命名规范

使用 TypeScript 模块、ES imports 和 React 函数组件。保持两个空格缩进、单引号和分号。

- React 组件：`PascalCase`，例如 `OrdersPage.tsx`。
- hook：`use` 前缀，例如 `useOrders.ts`。
- 后台模块：描述性 kebab-case，例如 `compliance-detect.ts`。
- IPC channel：按功能命名空间组织，例如 `accounts:list`、`scheduledJobs:update`。
- **注释**：所有代码都应添加详细的、给人看的注释。

## 构建、测试与开发命令

- `npm install` 安装依赖并运行 `wxt prepare`。
- `npm run dev` 启动 Chrome 目标的 WXT 开发服务器。
- `npm run dev:firefox` 启动 Firefox 目标的开发模式。
- `npm run compile` 运行 `tsc --noEmit` 做 TypeScript 校验。
- `npm test` 运行 `tests/` 下的 `node:test` 测试（详见 `docs/ai_guides/testing.md`）。
- `npm run build` 构建 Chrome 插件包；`npm run build:firefox` 构建 Firefox 版本。
- `npm run zip` / `npm run zip:firefox` 创建可分发压缩包。
- `npm run data:wxshop-categories`、`npm run data:category-map:itemcats` 离线生成微信小店分类与淘宝类目映射数据。

## 交付前自检

完成一个任务或一组关联改动、准备交付前，必须自己重新 review 一遍全部改动，确认逻辑正确、边界处理完整、与架构规则一致，再向用户报告完成。不得把"能编译、能跑"等同于"完成"。

## 安全与配置提示

不要提交真实 app 凭证、access token 或客户数据。账号配置和微信 API 客户端值都应视为敏感信息。新增 `wxt.config.ts` host permissions 时保持范围尽量窄，并在 PR 中解释权限变化。

## 子模块指南索引

💡 **模块上下文**：修改下列模块前，先读对应文档获取完整业务逻辑和设计规范。

**横切指南（改目录结构 / 联调 / 写测试时必读）：**

- 改目录布局、新增入口、调整模块归属、决定数据存哪 → `docs/ai_guides/project-structure.md`（含存储仓储 + 持久化分层）
- 改完代码不确定要不要刷页 / reload 插件 / 重启 dev server → `docs/ai_guides/dev-reload.md`（含 WXT 开发浏览器约定）
- 写测试、跑测试、踩 `OrderStatus` enum 的坑、补用例 → `docs/ai_guides/testing.md`

**领域指南（改对应业务域时必读）：**

- 后端分层、runtime IPC 类型化、前端意图层、存储与 TanStack Query 缓存闭环、Zustand、host permissions → `docs/ai_guides/architecture.md`
- 微信小店接口调用、access token 生命周期、`client.ts` 边界 → `docs/ai_guides/wxshop-token.md`
- 上货草稿箱 vs 商品提审边界、`listing=0` 门禁、`categoryprecheck` 归属 → `docs/ai_guides/listing-vs-audit.md`
- 定时任务、`ScheduledJob`、调度中心、executor 注册 → `docs/ai_guides/scheduler.md`
- 淘宝/天猫页面读取、`src/content/taobao/` 分层、选择器保守原则、工作标签页、安全验证 → `docs/ai_guides/taobao-reading.md`
- 发货助手会话流程、`ShippingSession`、content 工具栏 → `docs/ai_guides/shipping.md`
- 工作台日志中心、ActivityLog / DiagnosticLogger / 通知规则、日志安全 → `docs/ai_guides/logging.md`
- 鉴权门控、`LicensedFeature` 映射（默认关闭）→ `docs/ai_guides/licensing.md`

> 每个领域指南文件顶部第一行都写明了「适用范围 / 改 X 时必读」，先看那一行判断是否真的需要读全文。

---

# 优先级最高的规则，该规则由用户手写，不允许被覆盖，不允许修改

- 该项目是一个chrome插件，主要功能是帮助商户管理微信小店铺，提供订单管理、店铺管理、商品合规扫描等功能。
- 该项目使用了React、TypeScript和Ant Design等技术栈，代码结构清晰，模块划分合理，具有较好的可维护性和可扩展性。
- 该项目的开发和测试需要使用WXT工具，WXT是一个专门用于开发微信小程序和微信插件的工具，提供了丰富的功能和调试支持。
- 所有代码都应该添加详细的注释，给人看的注释。
- 当前项目处于早期阶段呢，遇见不合理的地方，优先考虑重构和优化，而不是临时修补。
