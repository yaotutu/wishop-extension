# Dianxiaoqi Extension

店小七 Chrome Manifest V3 插件版，基于 WXT、React、TypeScript 和 Ant Design。

## Environment

项目统一使用 Node.js 22 和 npm 10。使用 nvm 时可直接执行：

```bash
nvm use
npm ci
```

`package-lock.json` 是依赖安装的唯一事实来源。日常开发和 CI 都应使用 `npm ci`，避免因为宽松版本范围产生不可复现的构建结果。

## Development

```bash
npm run dev
npm test
npm run compile
npm run build
```

提交或发布前可以运行完整验证：

```bash
npm run verify
```

真实 Chrome 主流程验收步骤见 [Chrome 回归清单](docs/chrome-regression-checklist.md)。涉及 background、content script、依赖或 manifest 的修改，需要重启开发服务器、重新加载插件并重新打开淘宝/天猫目标页面。

## Release

```bash
npm run push
```

This validates and builds the extension locally, bumps the patch version with `npm version patch`, pushes the version commit and tag, then lets GitHub Actions build the zip package and publish a GitHub Release from the `v*` tag.
