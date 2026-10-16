# 淘宝页面读取架构指南

> 改 `src/content/taobao/`、淘宝/天猫页面读取、选择器、工作标签页或安全验证时必读。
> 商品采集的专题深入设计见 `docs/taobao-product-collection-agent-guide.md`。

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
