# 项目结构与模块组织

> 适用范围：改任何目录布局、新增入口、调整模块归属、决定一段数据存哪时必读。本文是 AGENTS.md 「项目结构与模块组织」一节的完整版，AGENTS.md 只保留一句话概述，细节都在这里。

本项目是一个基于 WXT、React、TypeScript 和 Ant Design 构建的 Chrome Manifest V3 插件。

## 入口与页面

- `entrypoints/background.ts` 注册插件后台入口。
- `entrypoints/dashboard/` 包含后台管理页面的 HTML 和 React 启动代码。
- `entrypoints/taobao.content.tsx` 注册淘宝/天猫页面的通用 content script，承载发货助手、采购单读取、退款和商品采集等淘宝工作流。
- `entrypoints/taobao-product-collector-main-world.content.ts` 是运行在 main world 的商品详情采集脚本，只负责读取商品公开字段并过滤掉地址、手机号等隐私信号；它通过自定义事件与 content script 通信，**不直接调用后台 IPC**。
- `src/App.tsx`、`src/main.tsx` 和 `src/index.css` 提供应用外壳和全局样式。
- `src/components/` 放置通用 UI，例如布局、统计卡片和账号弹窗。
- `src/pages/` 按业务域组织功能页面，包括 `orders`、`settings`、`store-management`、`product-copy`（复制上货）、`scheduled-jobs`（定时任务）、`compliance`（合规扫描）、`batch-operations`（批量操作）和 `common-functions`（常用功能）。
- `src/pages/orders/` 按职责拆分：`OrdersPage.tsx` 负责页面状态和动作，`components/` 负责表格列、工具栏、详情弹窗和货源弹窗，`order-display.ts` 负责订单展示辅助逻辑。

## 后台（background）

- `src/background/` 包含后台运行时接线、功能处理器、定时任务、任务模块、服务、仓储、微信小店客户端和 AI 客户端代码。
- `src/background/handlers.ts` 应保持为**很薄的 runtime 消息传输层**。新增 IPC 行为应通过 `src/background/router/`、`src/background/runtime-handlers/` 和 `src/background/services/` 实现。
- `src/background/scheduler/` 是统一定时任务中心。新增定时任务**只能**通过这里注册执行器，不要在业务模块里单独创建 `chrome.alarms`、`setInterval` 或其它散落的定时循环。
- `src/background/ai/` 放置 OpenAI 兼容客户端等外部 AI 调用封装，集中处理密钥脱敏和 URL 归一化。
- `src/background/orders/` 是订单业务域，包含订单同步、订单领域服务、订单本地存储、订单索引文本和售后增强等模块。

## Content Scripts

- `src/content/taobao/` 包含淘宝/天猫页面读取、自动化适配器、content runtime 和注入 UI。页面读取能力应按 `dom/`、`adapters/`、`runtime/` 和 UI 组件分层组织。

## 共享与状态

- `src/hooks/`、`src/contexts/` 和 `src/shared/` 放置可复用 hook、Provider、共享类型、错误和 IPC 辅助方法。
- `src/query/` 放置 TanStack Query 的 query client 和 query key 定义。
- `src/stores/` 放置 Zustand 轻量 UI 状态和用户偏好（例如悬浮工具栏位置、折叠状态）。
- `src/shared/runtime-channels.ts` 是 runtime IPC channel 参数和返回值类型的**唯一事实来源**。

## 静态资源

- `public/` 和 `assets/` 存放插件静态资源和图标。

## 存储仓储（chrome.storage.local）

- `src/background/store/` 包含基于 `chrome.storage.local` 的存储仓储；`src/background/store.ts` 仅保留为兼容导出层，新的后台代码应**直接导入具体仓储**（如 `account-repository.ts`、`scheduled-job-repository.ts`），不要走旧的聚合导出。
- 仓储 schema 见 `src/background/store/core.ts` 的 `StoreSchema`，版本号 `CURRENT_STORAGE_VERSION` 在同一文件，升级需同步改 `migrations.ts`。

## 持久化分层（必读）

后台持久化分两层，按数据特征选层，**不要混用**：

| 层 | 位置 | 适合放什么 | 不适合放什么 |
| --- | --- | --- | --- |
| 配置层 | `src/background/store/*.ts`（chrome.storage.local） | 账号配置、access token、设置、定时任务、规则等**量小、整存整取、按账号读**的配置 | 大批量记录、需要索引/范围查询的数据 |
| 索引层 | `src/background/db/extension-db.ts`（Dexie / IndexedDB） | 订单快照、活动日志、通知、账号快照等**体量大、需要索引查询**的记录 | 配置类数据 |

判断依据：

- **体量较大、需要索引查询**的持久化数据 → 放 `src/background/db/extension-db.ts` 的 Dexie 表里（订单快照 `OrderRecord`、活动日志、通知、账号快照等）。
- **量小、整存整取、按账号聚合**的配置类数据 → 放 `src/background/store/` 的具体仓储里。
- 新增 IndexedDB 表：在 `extension-db.ts` 里加 `Table` 定义和 schema version，不要另起 Dexie 实例。
- 违禁词已全局化：不再随账号存储。`globalViolationWords` 是所有模块共享的通用词库，`moduleViolationWords` 按模块名（如 `'productCopy'`）存放各业务域补充词库，两者都写在 `__global_rules__` 这条全局 workspace 上，跨账号共享。

> 注意：`src/background/store.ts` 已退化为兼容导出层，新代码不要往里加内容，直接用 `src/background/store/` 下的具体仓储。
