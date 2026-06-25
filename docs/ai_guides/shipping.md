# 发货助手指南

> 改发货流程、`ShippingSession`、发货工具栏时必读。

订单发货流程基于会话：

- 后台管理页的订单动作通过后台 IPC 创建短生命周期的 `ShippingSession`。
- 后台打开淘宝/天猫标签页，并将 `tabId` 绑定到该会话。
- Content script 从后台请求当前会话并挂载工具栏。
- Content script 不得读取微信凭证，也不得直接调用微信接口。

淘宝/天猫 DOM 访问应放在 `src/content/taobao/` 的适配器后面。选择器和页面识别逻辑不要写进工具栏组件。后续自动化能力应先在适配器中添加稳定的方法，例如 `detect`、`read`、`fill` 和 `validate`，再改 UI 代码。
