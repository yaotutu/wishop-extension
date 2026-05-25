# 订单本地优先域设计

## 背景

订单管理需要新增“全部账号”视图，并把订单数据流从“页面按账号请求微信接口”改成“后台订单域统一同步，本地仓库统一查询”。项目没有历史包袱，本设计采用本地优先的订单域重构，不以兼容旧订单查询流程为目标。

核心原则：

- 订单页不直接调用微信小店订单列表或搜索接口。
- 切换账号、切换到全部账号、切换筛选条件只读取本地订单仓库。
- 后台订单域是唯一订单数据入口，负责同步、搜索、刷新、详情和状态。
- 存储实现必须可替换。第一版可以用轻量临时实现，后续可换 IndexedDB，不影响 UI、IPC 和业务服务。
- 微信 API 可重新获取的订单详情、订单状态和订单列表不进入已有订单云同步范围。

## 用户体验

订单管理左侧账号栏新增“全部账号”入口。

- 选中“全部账号”时，订单表展示所有账号的本地订单快照。
- 选中单个账号时，订单表只展示该账号的本地订单快照。
- 切换账号或切换到全部账号不触发远程请求。
- 工具栏展示上次更新时间、同步状态、自动更新倒计时和“立即更新”按钮。
- 自动同步周期第一版为 1 分钟。
- “立即更新”在单账号视图刷新当前账号，在全部账号视图刷新所有账号。

搜索支持两种模式：

1. 本地搜索
   - 默认模式。
   - 从本地订单仓库按当前视图范围搜索。
   - 不触发微信接口。

2. 服务器最新搜索
   - 用户显式选择后触发。
   - 单账号视图只搜索当前账号。
   - 全部账号视图跨所有账号搜索，合并结果并展示账号来源。
   - 搜索结果回写本地订单仓库。

## 领域模型

订单页和后台 IPC 使用明确的订单范围，不使用“全部账号”虚拟账号 ID。

```ts
type OrderScope =
  | { type: 'all' }
  | { type: 'account'; accountId: string };

type OrderSearchSource = 'local' | 'remote';
```

仓库中的每条订单记录都必须带真实账号来源。

```ts
interface StoredOrderSnapshot {
  accountId: string;
  accountName: string;
  orderId: string;
  order: Order;
  indexedText: string;
  lastFetchedAt: number;
  lastChangedAt: number;
  source: 'autoSync' | 'manualRefresh' | 'remoteSearch' | 'detailRefresh';
}
```

全部账号表格使用 `accountName` 展示来源；所有订单动作使用 `accountId` 和 `orderId` 定位真实账号。

## 后台架构

第一版重建订单域，按以下边界组织。

### OrderDomainService

订单域对 runtime handler 暴露的门面服务。

职责：

- `list(scope, filters)`：只读本地仓库。
- `search(scope, params, source)`：根据 `source` 选择本地搜索或服务器最新搜索。
- `refresh(scope)`：触发单账号或全部账号刷新。
- `detail(accountId, orderId, options)`：读取订单详情，必要时刷新远程详情并回写仓库。
- `syncState(scope)`：返回同步状态、错误摘要、上次更新时间和下次自动同步时间。

订单页只调用 `OrderDomainService` 对应 IPC，不直接调用 `WxOrderSource`。

### WxOrderSource

微信小店订单数据源适配器，只负责远程读取。

职责：

- 按账号拉取最近订单列表和详情。
- 按账号执行微信小店订单搜索。
- 按订单号拉取最新详情。
- 不保存订单，不处理 UI 筛选，不管理同步状态。

`WxOrderSource` 内部继续通过统一 token 服务和 `getClient(accountId)` 调微信接口。

### OrderStore

本地订单仓库接口，隐藏底层数据库。

核心能力：

- `upsertMany(accountId, accountName, orders, source)`：批量写入订单快照。
- `list(scope, filters)`：按范围、状态、时间和分页读取本地订单。
- `search(scope, params)`：本地搜索。
- `get(accountId, orderId)`：读取单个订单快照。
- `getSyncState(scope)`：读取同步状态。
- `markSyncStarted(scope)` / `markSyncFinished(scope, result)`：记录同步状态。

第一版默认每账号保留最近 `500` 条订单快照。存储实现可以先落在一个独立 repository 文件中，但调用方只能依赖 `OrderStore` 接口。

### OrderSyncService

同步中心，负责自动同步和手动刷新。

职责：

- 每分钟触发一次全部账号近期订单同步。
- 单账号刷新、全部账号刷新和远程搜索共享同一套账号级刷新队列。
- 同一账号已有刷新在执行时，新请求复用或排队，避免重复打微信接口。
- 跨账号刷新采用小并发，账号失败不影响其它账号。
- 同步完成后写入 `OrderStore`，并更新账号级和全局同步状态。
- 对自动同步只写必要摘要日志，避免高频全局日志打扰用户。

第一版自动同步只拉取每账号最新首批订单，服务器最新搜索用于用户主动确认更精确结果。历史深度分页和长期归档不在第一版展开。

## 调度设计

订单自动同步仍必须走统一 `ScheduledJob` 架构。

为了避免为每个账号创建一个每分钟 alarm，调度中心需要支持扩展级单例任务：

- `ScheduledJobScope` 增加 `system`。
- 新增 job type：`orders.syncRecent`。
- `entrypoints/background.ts` 注册 `orders.syncRecent` executor。
- 后台启动时确保存在一个启用的系统任务，cron 为 `*/1 * * * *`。
- 该任务每分钟只触发一次，由 `OrderSyncService.refreshAll({ reason: 'autoSync' })` 内部管理账号队列。

`orders.checkShipmentStatus` 等现有账号级或全账号业务任务保持原有语义。

## IPC 设计

订单页使用新的类型化订单域 IPC。旧的远程直连订单列表和搜索入口不作为新订单页依赖。

第一版订单域 channel：

- `orders:list`
  - 参数：`scope`、筛选、分页。
  - 行为：只读本地仓库。

- `orders:search`
  - 参数：`scope`、搜索参数、`source: 'local' | 'remote'`。
  - 行为：本地搜索或服务器最新搜索；远程搜索成功后回写仓库。

- `orders:refresh`
  - 参数：`scope`。
  - 行为：刷新单账号或全部账号。

- `orders:detail`
  - 参数：`accountId`、`orderId`、可选 `refresh`。
  - 行为：默认优先读本地；`refresh` 或本地缺失时拉远程并回写。

- `orders:syncState`
  - 参数：`scope`。
  - 行为：返回当前范围的同步状态。

仍需保留的订单动作 channel 包括解密地址、快递公司列表、回填发货等，但这些动作必须接收真实 `accountId`，不能接收全部账号范围。

## 前端设计

`Layout` 的订单模块账号栏显示“全部账号”。订单页接收 `OrderScope`，不再只接收 `accountId`。

订单页 hook 改成围绕订单域 IPC：

- `useOrderListQuery(scope, filters)` 读取本地列表。
- `useOrderSearchMutation(scope)` 根据搜索模式调用本地或远程搜索。
- `useOrderRefreshMutation(scope)` 手动刷新。
- `useOrderSyncStateQuery(scope)` 展示上次更新时间、同步中状态和倒计时。

TanStack Query 只缓存后台仓库返回的视图数据，不再维护订单列表持久化缓存。现有 `order-list-cache.ts` 的职责应被订单仓库取代。

订单表在全部账号视图显示账号列，在单账号视图隐藏账号列。所有行级动作从订单记录读取真实 `accountId`。

## 错误处理

- 自动同步失败只更新同步状态摘要，不清空本地已有数据。
- 单账号凭证失效时，使用现有 credential error 机制提示用户，并在同步状态中标记该账号失败。
- 全部账号刷新时，部分账号失败仍返回成功账号的数据和失败账号摘要。
- 服务器最新搜索跨账号执行时，部分账号失败不清空已有本地结果。
- 本地仓库读取失败时，订单页展示明确错误，并允许用户手动重试刷新。

## 非目标

第一版不做：

- IndexedDB schema 设计。
- 长期订单归档策略。
- 云端保存微信订单详情或订单列表。
- 复杂全文索引。
- 深度历史订单自动回填。
- 后台持续常驻 `setInterval`。
- 页面驱动远程订单列表请求作为订单页主路径。

## 验证

实现后至少验证：

- `npm run compile`
- 订单管理可切换全部账号和单账号。
- 切换视图不触发远程订单列表或搜索请求。
- 每分钟自动同步只创建一个系统级订单同步任务。
- 手动刷新单账号只刷新该账号。
- 手动刷新全部账号能处理部分账号失败。
- 本地搜索不触发远程请求。
- 服务器最新搜索会回写本地仓库。
- 全部账号订单动作使用真实账号 ID。
- 现有发货、地址解密、采购关联和淘宝退款动作仍可在单账号订单上执行。
