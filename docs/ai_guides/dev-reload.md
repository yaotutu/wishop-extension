# 开发 Reload 指南

> 适用范围：本地联调、改完代码不确定要不要刷页 / reload 插件 / 重启 dev server 时必读。这是 AGENTS.md 抽出的场景化决策树，只在改特定文件时才用得上。

Chrome 扩展开发时，dashboard 页面和 background service worker 可能不同步。修改范围决定是否需要刷新页面、重新加载插件或重启 dev server：

## 开发浏览器约定（强制）

- Chrome 目标开发和测试**统一使用** `npm run dev` 启动的 WXT 开发浏览器。该浏览器必须固定使用仓库内 `wxt-chrome-data` 作为 Chrome `user-data-dir`，并固定开放 Chrome DevTools Protocol 端口 `127.0.0.1:19222` 供自动化测试和排查连接。
- **不要再使用**随机 WXT profile、`.wxt/chrome-profile`、`127.0.0.1:9222` 或日常真实 Chrome 执行插件联调，除非用户明确要求切换。
- 淘宝/天猫登录态只维护在 `wxt-chrome-data` 里。遇到淘宝要求登录时，应先确认当前连接的是 `127.0.0.1:19222` 对应的 WXT 开发浏览器，不要误读其它 Chrome 实例。

## 按改动范围判断动作

| 改动范围 | 需要的动作 |
| --- | --- |
| 只改 React 页面、样式、普通前端 hook | 通常刷新 dashboard 页面即可 |
| 改 `src/background/`、`entrypoints/background.ts`、runtime IPC、`src/shared/runtime-channels.ts`、`src/shared/extension-api.ts`、store migration、scheduler、微信小店 client | 需要重新加载插件 |
| 改 content script、content adapter、content runtime | 需要重新加载插件，**并重新打开**目标网页标签页 |
| 改 `wxt.config.ts`、manifest、permissions、依赖、入口文件匹配规则 | 需要**重启** `npm run dev`，然后重新加载插件 |

## 自动 reload 行为

- 开发环境中如果前台 IPC 收到 `Unknown runtime channel`，`extensionApi` 会自动调用 `chrome.runtime.reload()` 重新加载插件；这表示前台 bundle 已更新但后台 service worker 仍是旧版本。
- Agent / Codex 修改了需要插件 reload 的文件后，应**主动完成 reload 或明确说明已触发自动 reload**，不要把判断成本留给用户。
