# 鉴权指南

> 改鉴权门控、`src/background/licensing/`、付费能力注册时必读。

鉴权结构已经存在，但在服务端准备好之前，鉴权拦截保持关闭。

- 共享鉴权类型位于 `src/shared/types.ts`。
- 本地鉴权持久化位于 `src/background/store/license-repository.ts`。
- 鉴权业务逻辑位于 `src/background/licensing/licensing-service.ts`。
- 鉴权 IPC 位于 `src/background/runtime-handlers/license-handlers.ts`。
- 路由层功能门控位于 `src/background/router/create-background-router.ts` 和 `src/background/router/runtime-router.ts`。
- 设置页有授权状态面板，但 `enforcementEnabled` 默认是 `false`。

在后端实现并且项目负责人明确开启拦截之前，不要用鉴权检查阻断用户工作流。新的付费能力仍应映射到 router feature map 中的 `LicensedFeature`，这样后续开启鉴权时不需要重做各个模块。
