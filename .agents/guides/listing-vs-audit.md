# 上货草稿与商品提审边界指南

> 改上货管理、商品提审、`productAudit` 相关 service/runtime channel 时必读。

上货管理和商品提审是两个不同业务域，不能因为微信底层接口名称相近而混用流程。

- 上货管理当前只允许创建微信小店草稿箱商品，业务命令必须使用 `DraftBox` 语义，例如 `prepareWxDraftBoxProduct`、`createPreparedWxDraftBoxProduct` 或 `createWxDraftBoxProduct`。
- 上货管理创建草稿箱时必须固定 `listing=0`，不得暴露 `autoListing`、`listing=1` 或“自动提审/上架”开关。
- 上货管理的草稿箱创建流程不得调用 `categoryprecheck`、`submitProductAudit`、`/channels/ec/product/listing` 或其它提审/上架门禁接口。草稿箱创建失败只能来自数据准备、图片上传、微信 `addProduct` 写草稿等草稿创建相关原因。
- 微信小店 `addProduct` 是底层接口名，不代表业务上架。业务 service、runtime channel、extension API 和前端按钮文案必须用明确业务命名区分“创建草稿箱商品”和“提交商品提审”。
- `categoryprecheck` 属于商品提审域的提审前诊断能力，应放在 `productAudit` 相关 service、runtime handler 和 IPC 中，例如 `productAudit:precheckCategory`。它可以用于提审前提示或诊断，但不得回流到上货草稿箱创建路径。
- 新增或修改这两类流程时，必须补测试锁住边界：上货草稿箱测试要断言不调用发品前校验且提交 `listing=0`；商品提审测试要单独覆盖预检、提审接口和失败策略。
