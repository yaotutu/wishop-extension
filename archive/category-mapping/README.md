旧淘宝类目到微信小店类目映射数据归档在这里。

当前上货流程只使用 `public/data/wxshop-categories/wxshop-category-paths.runtime.json`
里的微信小店叶子类目全量缓存，再由 AI 从全量候选中选择类目。

- `source-data/`：历史生成的淘宝到微信类目映射原始数据。
- `runtime-public-data/`：历史 runtime lookup 缓存，原路径为 `public/data/category-mapping/`。

这些文件不再参与 WXT 构建和运行时读取。若后续要恢复旧 lookup 流程，应重新评估
类目命中质量，并通过新的 runtime channel 和测试接入，不要直接搬回 `public/data/`。
