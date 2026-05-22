# 订单云同步设计

## 背景

订单云同步用于把插件自己产生、微信小店 API 和采购平台页面都无法稳定重新获取的数据同步到云端。微信小店 API 能获取的数据、淘宝等采购平台能重新读取的数据，不进入订单云同步范围，避免重复存储业务数据和扩大隐私风险。

用户侧只暴露模块级同步能力：

- 云同步总入口：用户选择是否启用云同步能力。
- 模块级开关：第一版只有“订单同步”。后续可以增加商品、违规检测、设置等模块，但不在模块内部继续拆更细开关。

服务端不需要保存模块开关状态。开关是客户端行为：开启时插件调用云同步接口，关闭时插件停止调用云同步接口。本地数据和云端已有数据都不因关闭开关而自动删除。

## 订单模块同步范围

订单同步只包含微信小店 API 和采购平台页面拿不到、但插件订单管理功能需要跨设备保留的数据：

1. 商品货源绑定 `productSources`
   - `productId`
   - 货源链接
   - 采购数量
   - 货源备注
   - 创建和更新时间

2. 订单采购关联索引 `orderAssociations`
   - 微信订单号 `orderId`
   - 采购备注 `internalRemark`
   - 采购平台
   - 采购单号
   - 用户手写的采购单备注
   - 创建和更新时间

订单同步不包含：

- 微信 API 能拉到的订单详情、订单状态、商品标题、金额、支付信息。
- 淘宝等采购平台页面可重新读取的采购单状态、物流状态、快递公司、快递单号。
- 真实地址缓存，包括姓名、电话、详细地址和虚拟号。
- 订单列表缓存。
- 发货会话、淘宝读取会话、淘宝退款会话等临时流程状态。
- 全局日志、通知、模块日志。
- 微信 access token、AppSecret 或任何微信敏感凭证。

## 同步规则

订单同步采用记录级增量同步，不做字段级合并。

记录 key：

- `productSource` 使用 `productId`。
- `orderAssociation` 使用 `orderId`。

`orderAssociation` 的同步摘要和冲突判断只基于云端允许保存的最小字段，不把本地缓存的采购状态、物流状态、快递公司或快递单号纳入 hash。这样淘宝工作页刷新物流状态不会导致云同步冲突。

插件本地需要保存上次同步基准，包括：

- `lastServerRevision`
- 每条已同步记录的摘要或 hash
- 删除墓碑记录

同步时做三方比较：

- 上次同步基准
- 当前本地数据
- 当前云端数据

规则：

1. 云端有、本地没有，且本地没有删除记录：合并到本地。
2. 本地有、云端没有，且云端没有删除记录：上传到云端。
3. 只有一边相对上次同步基准发生变化：自动同步到另一边。
4. 本地和云端都相对上次同步基准修改了同一条记录，且内容不一致：产生冲突。
5. 删除和修改同一条记录也算冲突。
6. 冲突时弹出两个选择：
   - 以云端为主：云端记录覆盖本地记录。
   - 以本地为主：本地记录覆盖云端记录。
7. 冲突选择只作用于冲突记录；非冲突新增和单边修改仍按增量规则自动合并。

删除必须同步墓碑，否则无法区分“从未存在”和“用户删除过”。

```json
{
  "type": "orderAssociation",
  "key": "1234567890",
  "deletedAt": 1780000000000
}
```

## 触发时机

第一版不做高频轮询。

推荐触发：

- 用户开启订单同步后，立即同步一次。
- 打开后台管理页或切换店铺时，同步一次。
- 保存货源、保存采购单关联信息或用户备注后，延迟几秒同步一次。
- 淘宝工作页读取采购单完成后，如果只是刷新采购状态、物流状态、快递公司或快递单号，不触发云端变更；这些字段只作为本地缓存。
- 可选兜底：后台管理页打开期间每 5 到 10 分钟同步一次。

## 服务端职责

服务端只负责：

- 使用微信小店 `appId + appSecret` 完成云同步鉴权。
- 给插件返回云同步 token。
- 按店铺和模块保存订单同步记录。
- 提供按 revision 拉取变更的接口。
- 接收客户端提交的增量变更。
- 维护单调递增的 `serverRevision`。
- 保存删除墓碑。
- 拒绝订单模块 payload 中出现采购平台可重新读取的状态和物流字段。

服务端不负责：

- 保存同步开关。
- 拉取或存储微信订单详情。
- 拉取或存储淘宝等采购平台的采购状态和物流信息。
- 同步真实地址。
- 判断 UI 层冲突选择。
- 做字段级合并。
- 管理插件本地定时任务。

## 后端接口契约

以下接口路径仅为建议，服务端可以按实际网关前缀调整。后续插件实现只依赖语义和字段。

### 鉴权

`POST /v1/cloud-sync/auth`

请求：

```json
{
  "appId": "wx_appid",
  "appSecret": "wx_app_secret",
  "deviceId": "local-device-id",
  "extensionVersion": "0.0.50"
}
```

服务端行为：

- 使用 `appId + appSecret` 调微信接口验证凭证有效性。
- 鉴权成功后签发 `syncToken`。
- 不把 `appSecret`、access token 写入日志。
- 如无长期保存凭证的业务必要，不持久化 `appSecret`。

响应：

```json
{
  "shopId": "server-shop-id-or-appid",
  "syncToken": "cloud-sync-token",
  "expiresAt": 1790000000000,
  "serverTime": 1780000000000
}
```

后续接口使用：

```http
Authorization: Bearer cloud-sync-token
```

### 拉取订单模块变更

`GET /v1/cloud-sync/orders/changes?sinceRevision=12`

说明：

- `sinceRevision=0` 表示拉取当前订单模块全量记录。
- 大于 0 时只返回该 revision 之后发生变化的记录和删除墓碑。

响应：

```json
{
  "module": "orders",
  "serverRevision": 18,
  "records": [
    {
      "type": "productSource",
      "key": "product_123",
      "revision": 13,
      "updatedAt": 1780000000000,
      "hash": "sha256-or-other-hash",
      "payload": {
        "productId": "product_123",
        "sources": []
      }
    },
    {
      "type": "orderAssociation",
      "key": "order_123",
      "revision": 14,
      "updatedAt": 1780000000000,
      "hash": "sha256-or-other-hash",
      "payload": {
        "orderId": "order_123",
        "internalRemark": "",
        "linkedOrders": [
          {
            "id": "linked_123",
            "platform": "taobao",
            "platformOrderId": "tb_order_123",
            "remark": "",
            "createdAt": 1780000000000,
            "updatedAt": 1780000000000
          }
        ],
        "createdAt": 1780000000000,
        "updatedAt": 1780000000000
      }
    }
  ],
  "deletedRecords": [
    {
      "type": "orderAssociation",
      "key": "order_456",
      "revision": 15,
      "deletedAt": 1780000000000
    }
  ]
}
```

### 提交订单模块变更

`POST /v1/cloud-sync/orders/changes`

请求：

```json
{
  "baseRevision": 18,
  "clientId": "local-device-id",
  "changes": {
    "upserts": [
      {
        "type": "orderAssociation",
        "key": "order_123",
        "updatedAt": 1780000000000,
        "hash": "sha256-or-other-hash",
        "payload": {
          "orderId": "order_123",
          "internalRemark": "",
          "linkedOrders": [
            {
              "id": "linked_123",
              "platform": "taobao",
              "platformOrderId": "tb_order_123",
              "remark": "",
              "createdAt": 1780000000000,
              "updatedAt": 1780000000000
            }
          ],
          "createdAt": 1780000000000,
          "updatedAt": 1780000000000
        }
      }
    ],
    "deletes": [
      {
        "type": "productSource",
        "key": "product_123",
        "deletedAt": 1780000000000
      }
    ]
  }
}
```

服务端行为：

- 如果 `baseRevision` 是当前最新 revision，接受变更。
- 每条 upsert 或 delete 都生成新的服务端 revision。
- 返回新的 `serverRevision` 和服务端接受后的记录摘要。
- 如果服务端 revision 已变化，可以返回 `409`，让插件重新拉取变更并重新做三方比较。

成功响应：

```json
{
  "module": "orders",
  "serverRevision": 21,
  "acceptedRecords": [
    {
      "type": "orderAssociation",
      "key": "order_123",
      "revision": 20,
      "updatedAt": 1780000000000,
      "hash": "sha256-or-other-hash"
    }
  ],
  "acceptedDeletedRecords": [
    {
      "type": "productSource",
      "key": "product_123",
      "revision": 21,
      "deletedAt": 1780000000000
    }
  ]
}
```

revision 冲突响应：

```json
{
  "code": "REVISION_CONFLICT",
  "message": "Server revision has changed. Pull latest changes before pushing.",
  "serverRevision": 22
}
```

### 吊销云同步授权

`POST /v1/cloud-sync/auth/revoke`

可选接口。用户清除云同步授权时使用。

请求：

```json
{
  "deviceId": "local-device-id"
}
```

响应：

```json
{
  "revoked": true
}
```

## 服务端数据模型建议

服务端可以按店铺、模块和记录 key 存储：

- `shopId`
- `module`: 第一版固定为 `orders`
- `recordType`: `productSource` 或 `orderAssociation`
- `recordKey`: `productId` 或 `orderId`
- `payload`
- `payloadHash`
- `serverRevision`
- `updatedAt`
- `deletedAt`

revision 建议按 `shopId + module` 单调递增，便于插件按模块拉取变更。

删除墓碑需要保留一段足够长的时间。第一版可以长期保留，后续再做清理策略。

## 隐私和日志要求

服务端禁止把以下内容写入业务日志或错误日志：

- `appSecret`
- access token
- 真实地址、电话、姓名
- 原始订单详情
- 采购平台可重新读取的采购状态、物流状态、快递公司和快递单号

订单云同步接口收到的 payload 不应包含上述字段。服务端仍应做字段校验，拒绝明显包含真实地址、微信订单详情、采购状态或物流信息的大型 payload。
