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
