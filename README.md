# Wishop Extension

微店管家 Chrome Manifest V3 插件版，基于 WXT、React、TypeScript 和 Ant Design。

```bash
npm run dev
npm run build
```

## Release

```bash
npm run push
```

This validates and builds the extension locally, bumps the patch version with `npm version patch`, pushes the version commit and tag, then lets GitHub Actions build the zip package and publish a GitHub Release from the `v*` tag.
