# 淘宝商品采集 Agent 指南

这份文档面向后续参与本项目的 AI agent。修改淘宝商品采集能力前，应先阅读本文件，再结合真实登录浏览器验证淘宝页面结构。不要凭经验猜淘宝 DOM，也不要把页面读取、业务保存和 UI 展示混在一起。

## 目标

复制商品模块的核心输入是一个淘宝或天猫商品 URL，输出是后续可映射到微信小店草稿箱商品的结构化商品数据。当前阶段先完成淘宝侧采集和本地保存，微信小店提交逻辑后续再接入。

采集结果至少应覆盖：

- 商品 ID、平台、原始 URL。
- 标题、店铺、卖家基础信息。
- 价格、销量、发货信息。
- 主图、图文详情图。
- 商品参数。
- SKU 规格组、SKU 矩阵、价格、库存和发货时效。

## 核心思路

淘宝商品页的数据来源分两类：

1. 页面运行时结构化数据。
2. 页面异步渲染后的真实 DOM。

采集时优先读取淘宝页面自己已经加载出来的结构化模型，再用真实 DOM 补齐结构化模型里缺失或异步渲染的内容。不要用宽泛选择器从整页文本里硬抠权威字段。

当前实现采用以下策略：

```text
用户输入淘宝 URL
  -> background 创建商品采集会话
  -> background 打开或复用淘宝工作标签页
  -> content runtime 检测登录、验证码、安全验证和页面类型
  -> MAIN world content script 读取淘宝页面运行时模型
  -> MAIN world content script 从详情区域稳定读取图文详情图
  -> adapter 转换成 TaobaoProductSnapshot
  -> background 保存为 ProductCopyRecord
  -> 复制商品页面展示本地采集结果
```

## 为什么使用 MAIN world

淘宝商品页的关键结构化数据位于页面自身 JavaScript 运行环境，例如 `window.__ICE_APP_CONTEXT__`。普通 isolated world content script 不能直接可靠访问页面 world 里的运行时对象。

因此商品采集使用独立的 MAIN world content script：

- `entrypoints/taobao-product-collector-main-world.content.ts`

它只做页面 world 读取和最小必要清洗，然后通过页面消息把结果交给 isolated world 的 content runtime。不要在页面里注入 inline script；这会触发淘宝页面 CSP 问题，也更难维护。

## 结构化模型优先

商品标题、店铺、主图、价格、SKU、参数等字段，应优先从淘宝页面模型读取。当前主要读取范围包括：

- `seller`
- `item`
- `plusViewVO.industryParamVO`
- `skuBase`
- `skuCore.sku2info`
- `componentsVO.headImageVO`
- `componentsVO.titleVO`
- `componentsVO.deliveryVO`
- `componentsVO.priceVO`

MAIN world 读取的数据必须做字段清洗。任何疑似地址、电话、手机号、token、cookie、买家、用户身份相关字段，都不能传回 background 或进入日志。

## 图文详情图策略

图文详情图通常不是首屏结构化模型里完整给出，而是由淘宝详情模块通过类似 `desc/getdesc` 的异步流程渲染到页面。

当前实现优先从真实详情区域读取图片：

- `#imageTextInfo-content`
- `.desc-root`
- `.descV8-container`

读取图片 URL 时要兼容淘宝懒加载属性：

- `data-src`
- `data-ks-lazyload`
- `data-original`
- `data-lazy-src`
- `src`

不要写死“等待 N 秒后读取”。详情模块可能分批渲染，固定时间会导致偶发少图。当前使用 `waitForStableDetailImages()`，要求非空图片列表连续多次保持一致；如果一直不稳定，则返回读取过程中数量最多的一版。

相关文件：

- `src/content/taobao/runtime/detail-image-stability.ts`
- `tests/detail-image-stability.test.ts`

## 分层边界

淘宝商品采集必须遵守现有 content 子系统分层：

- `entrypoints/taobao-product-collector-main-world.content.ts`：只负责 MAIN world 页面模型和详情图读取。
- `src/content/taobao/runtime/page-world-product-collector.ts`：负责 isolated world 与 MAIN world 的消息桥。
- `src/content/taobao/runtime/product-copy-workflow.ts`：负责采集流程、页面检测、异常处理和调用后台 IPC。
- `src/content/taobao/adapters/product-detail-collection-adapter.ts`：负责把页面模型和 DOM fallback 转换成 `TaobaoProductSnapshot`。
- `src/background/services/product-copy-session-service.ts`：负责会话、队列、工作标签页、保存和活动日志。
- `src/background/store/product-copy-record-repository.ts`：负责本地采集结果持久化。
- `src/pages/product-copy/ProductCopyPage.tsx`：只负责输入 URL、展示列表和预览采集结果。

UI 组件不得直接读取淘宝 DOM。adapter 不得保存数据、发 IPC、写 ActivityLog 或渲染 UI。background service 不得操作淘宝 DOM。

## 真实页面验证要求

当采集结果异常时，先连接真实登录浏览器查看页面，不要直接改选择器。排查顺序：

1. 确认读取的是用户真实登录 Chrome，不是 WXT 开发 Chrome。
2. 确认目标页不是登录页、验证码页、安全验证页或访问受限页。
3. 在 DevTools 或 CDP 中检查 `window.__ICE_APP_CONTEXT__` 是否存在目标数据。
4. 检查详情区域 DOM 是否已经渲染图片，以及图片 URL 位于哪个懒加载属性。
5. 如需分析接口，可观察淘宝页面自己的网络请求，例如详情描述相关 mtop 请求；但不要在未验证签名、cookie、风控影响前，把接口调用作为后台直接请求。

如果真实页面结构变化，先更新 adapter 或 MAIN world reader，并补对应测试，再改 UI。

## 安全与日志

商品采集不能记录敏感数据：

- 不记录 access token、appSecret、cookie。
- 不记录手机号、真实地址、收件人、买家身份信息。
- MAIN world 模型传输前必须做敏感字段过滤。
- 业务可见进度写 ActivityLog；细粒度排查写 DiagnosticLogger。不要散落 `console.*`。

## 后续演进方向

如果后续需要进一步提高稳定性，可以在真实页面验证后解析淘宝详情接口响应中的图文详情内容。但要注意：

- 接口调用可能依赖淘宝登录态、签名、cookie、风控和页面上下文。
- 优先复用页面已经发出的数据或页面已渲染 DOM。
- 若新增接口解析，也应封装在 adapter 或 MAIN world reader 后面，不要让 UI 或 background 直接依赖淘宝接口细节。

微信小店上架对接时，应先建立淘宝采集模型到微信小店草稿模型的显式 mapper。类目、品牌、属性不匹配可以引入大模型辅助识别，但采集层仍应尽量保留淘宝原始结构化事实，避免提前丢信息。
