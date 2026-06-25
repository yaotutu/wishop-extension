# 微信小店 API 与 Token 架构指南

> 改 `src/background/wxshop/`、微信小店接口调用或账号配置时必读。

微信小店后台接口必须通过统一 token 服务调用，不保留 client 内部 token 兼容入口。

- `src/background/wxshop/access-token-service.ts` 是 access token 生命周期的唯一入口，负责 `appid + secret` 换 token、内存缓存、`chrome.storage.local` 持久缓存、过期提前刷新、并发刷新去重、强制刷新和失效清理。
- `src/background/wxshop/client.ts` 只暴露微信小店业务接口，例如商品、订单、配额、发货、解密地址和快递公司列表。它不得暴露 `getAccessToken`、`clearTokenCache`、`config` 或其它 token/凭证相关入口。
- 新增微信小店接口时，只能在 `client.ts` 中通过统一 `request()` 封装声明 path、body 和返回值处理；不要在业务 service、runtime handler、scheduler executor 或 UI 中拼 `access_token`。
- 上层业务代码不得读取、传递、缓存或记录 access token，也不得为了日志或限速从微信 client 读取 `appId`。需要业务隔离 key 时使用 `accountId`。
- 账号配置新增、更新、删除时必须清理对应 token 缓存；校验配置时可以直接调用 `access-token-service` 强制刷新 token，但不要绕回 `WxShopClient`。
- token、appSecret 和任何微信敏感凭证都不得进入全局日志、模块日志、通知、错误详情或 UI 展示。
