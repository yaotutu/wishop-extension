# 一次性离线脚本

这些脚本不属于插件运行时，不接入 background、UI 或 runtime IPC。它们只用于生成开发期数据快照。

## fetch-taobao-itemcats.ts

通过淘宝开放平台 `taobao.itemcats.get` 递归获取淘宝标准商品类目，并输出本地 JSON 快照。

必需环境变量：

```bash
TAOBAO_APP_KEY=xxx
TAOBAO_APP_SECRET=xxx
TAOBAO_SESSION=xxx
```

可选环境变量：

```bash
TAOBAO_API_URL=https://eco.taobao.com/router/rest
TAOBAO_ITEMCATS_OUTPUT=data/category-snapshots/taobao-itemcats.json
```

运行：

```bash
node scripts/fetch-taobao-itemcats.ts
```

指定输出路径：

```bash
node scripts/fetch-taobao-itemcats.ts --out=data/category-snapshots/taobao-itemcats.json
```

输出结构：

```json
{
  "source": "taobao.itemcats.get",
  "fetchedAt": "2026-06-01T00:00:00.000Z",
  "rootParentCid": "0",
  "total": 1,
  "categories": [
    {
      "cid": "5001",
      "parentCid": "0",
      "name": "数码",
      "isParent": true,
      "status": "normal",
      "sortOrder": 12,
      "level": 1,
      "path": ["数码"]
    }
  ]
}
```

## build-taobao-itemcat-wxshop-category-map.mjs

用本地淘宝 itemcat 字典和微信小店全量叶子类目生成“淘宝类目 ID -> 微信小店类目候选”对照表。

输入：

```bash
public/data/taobao-itemcats/taobao-itemcats-runtime.json
data/wxshop-categories/wxshop-category-paths.json
```

运行：

```bash
node scripts/build-taobao-itemcat-wxshop-category-map.mjs
```

输出：

```bash
data/category-mapping/taobao-itemcat-to-wxshop-category-map.json
data/category-mapping/taobao-itemcat-to-wxshop-category-map.csv
data/category-mapping/taobao-itemcat-wxshop-category-map.runtime.json
```

默认只映射淘宝叶子类目。需要把父类目也纳入审计时：

```bash
node scripts/build-taobao-itemcat-wxshop-category-map.mjs --include-parent
```

默认 JSON 是精简结果，CSV 是全量人工审计表。需要输出每个淘宝类目的完整候选列表时：

```bash
node scripts/build-taobao-itemcat-wxshop-category-map.mjs --full-json
```

注意：当前运行时淘宝 itemcat 字典来自 2020 年公开快照，可能缺少淘宝商品详情页上的新版类目 ID。若采集到的 `sourceCategory.id` 不能反查中文类目，应先用 `fetch-taobao-itemcats.ts` 拉取新的淘宝类目快照，再更新运行时字典。

## fetch-wxshop-categories.mjs

生成微信小店全量叶子类目的运行时缓存，供 AI 从固定候选列表里选择类目。

默认优先读取已有快照：

```bash
data/wxshop-categories/wxshop-category-paths.json
```

运行：

```bash
npm run data:wxshop-categories
```

输出：

```bash
public/data/wxshop-categories/wxshop-category-paths.runtime.json
public/data/wxshop-categories/wxshop-category-paths.runtime.csv
```

输出 JSON 中的每条 `paths[]` 都是一个最终可选择的叶子类目：

```json
{
  "catIds": ["10000155", "10000157", "547456"],
  "names": ["生鲜", "水果", "同城配送-释迦果"],
  "path": "生鲜 / 水果 / 同城配送-释迦果",
  "leaf": true
}
```

需要重新请求微信官方接口时：

```bash
WXSHOP_APP_ID=xxx WXSHOP_APP_SECRET=xxx npm run data:wxshop-categories -- --refresh
```

也可以使用已有 access_token：

```bash
WXSHOP_ACCESS_TOKEN=xxx npm run data:wxshop-categories -- --refresh
```

注意：脚本只用于一次性数据快照，不会把 access_token、AppSecret 或店铺凭证写入输出文件。
