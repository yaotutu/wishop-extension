微信小店类目源快照归档在这里。

当前插件运行时只读取 `public/data/wxshop-categories/wxshop-category-paths.runtime.json`。
`source-data/` 下的 JSON/CSV 是生成运行时静态类目缓存的开发期源快照，不直接参与 WXT 构建里的业务读取。

需要刷新运行时静态类目缓存时，可以运行：

```bash
npm run data:wxshop-categories
```

脚本默认从这里的源快照生成 `public/data/wxshop-categories/` 下的 runtime 文件；需要重新拉取微信官方类目时再加 `-- --refresh`。
