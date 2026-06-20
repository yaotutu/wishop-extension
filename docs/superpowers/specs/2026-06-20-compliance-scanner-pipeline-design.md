# 商品合规扫描 · 三段式管道架构设计

> 日期：2026-06-20
> 状态：设计已与用户逐节确认，待复核
> 适用范围：`src/background/compliance/`、`src/background/services/compliance-service.ts`、`src/pages/compliance/`、`src/shared/types.ts`、`src/background/wxshop/listing/api.ts`

## 1. 背景与目标

### 1.1 现状问题

商品合规扫描的本质是「拿到数据 → 关键词匹配 → 输出结果」三段式流程，但现有代码把这三段焊死在「草稿箱 + 标题 + 删除」这一种组合上：

- **数据源写死**：`fetch-draft-products.ts` 只调 `getDraftProducts()`（草稿箱，`status=0`），没有「上架商品」这条来源。
- **匹配字段写死**：`compliance-detect.ts:findMatches` 只拿 `product.title` 做子串匹配。更关键的是 `getProductDetail` 返回的 `DraftProduct` 类型只有 `{ productId, title, headImgs, status, editStatus }`，根本没拉商品描述/详情/SKU 属性等文本字段，所以即使想扫描述，后端数据都没有。
- **输出动作写死**：`compliance-service.ts` 里命中后只有 `batchDelete`（删草稿）一条路径。

这种焊死让「扫上架商品」「扫商品描述」「导出报告而非删除」等扩展都要改核心流程，无法按接口插拔。

### 1.2 设计目标

把三段流程抽象成四个可替换接口，组成一条管道：

- 数据源、字段提取、匹配器、处置动作各自独立可替换。
- 本期默认实现 = 现在的「草稿箱 + 标题 + 删除」，行为完全不变。
- 接口为「上架商品 source」「标题+描述 extractor」「导出 action」等预留位置，本期不实现但接口就位。
- 批量扫描与逐个扫描共用同一个扫描核心，不重复实现。

### 1.3 已确认的设计决策

| 决策点 | 选择 |
|--------|------|
| 本期产出 | **只写设计文档，不动代码**。实现交由后续 writing-plans 出计划。 |
| 数据源范围 | 草稿箱（实现）+ 上架商品（接口预留，本期不实现）。 |
| 匹配字段 | 接口可配、默认只扫标题。 |
| 结果对象 | 带命中字段下钻信息（预结构化，本期即使只扫标题也支持多字段下钻）。 |
| 处置动作 | 可配、默认删除。 |
| 编排方式 | 统一一个 generator，上层选消费方式（批量收集 vs 逐个 yield）。 |
| 兼容性 | **不需要兼容旧逻辑，旧代码直接删除，不迁移数据。** |
| runtime IPC | 本轮不改 channel，只动 service 内部实现 + 页面渲染数据结构。 |

## 2. 核心抽象 —— 三段式管道

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ ScanSource  │ -> │ FieldExtractor│ -> │  WordMatcher │ -> │ ScanItem     │
│ (拉商品流)   │    │ (抽可扫文本)   │    │ (词库×文本)   │    │ (命中结果)    │
└─────────────┘    └──────────────┘    └──────────────┘    └──────┬───────┘
                                                                 │
                                                          ┌──────▼───────┐
                                                          │ ResultAction │
                                                          │ (处置动作)    │
                                                          └──────────────┘
```

| 接口 | 职责 | 输入 | 输出 |
|------|------|------|------|
| `ScanSource` | 拉取待扫描商品流 | accountId, signal | `AsyncGenerator<ScannableProduct>` |
| `FieldExtractor` | 从商品里抽出「可扫文本字段」清单 | `ScannableProduct` | `ScanField[]` |
| `WordMatcher` | 词库 × 字段文本 → 命中 | `ScanField[]`, words | `FieldMatch[]` |
| `ResultAction` | 对命中结果做处置 | `ScanItem`, ctx | 处置结果（删除/跳过/导出等） |

### 2.1 关键设计取舍

1. **`ScanSource` 产出 `ScannableProduct`（带全字段原材料），而不是 `DraftProduct`**：草稿箱商品和上架商品都能装进同一个载体。字段聚合（把 attrs/SKU 拼成文本）在 source 内部完成，不泄漏到匹配逻辑。

2. **`FieldExtractor` 与 `WordMatcher` 分离**：让「扫哪些字段」和「怎么匹配」独立变化。以后想做正则匹配只换 Matcher；想加扫描述只换 Extractor 配置。

3. **`ResultAction` 不在管道内，在消费侧**：scanner 是「纯扫描」，只产出 `ScanItem`；处置是消费侧的事。这样批量模式可以「只扫不删」（收集后让用户勾选再删），逐个模式可以「边扫边删」，都复用同一个 scanner。

4. **`ScanPlan` 把四段绑成一个对象**：scanner 构造时不固定四段，而是每次 `scan()` 传一个 `ScanPlan`。同一次会话里可以切换 plan（先批量扫、再切逐个删），scanner 实例无状态。

## 3. 接口签名与数据结构

### 3.1 核心数据结构

```ts
/**
 * 可扫描字段定义。FieldExtractor 产出这个清单，
 * 描述「本次要从商品的哪些字段里抽文本去匹配」。
 */
export interface ScanField {
  /** 字段标识，稳定不变，用于命中结果回指。如 'title' / 'desc' / 'attrs' */
  key: string;
  /** 给用户看的字段中文名。如「标题」「描述」 */
  label: string;
  /** 该字段实际待匹配的文本。多个属性/SKU 可拼成一段文本。 */
  text: string;
}

/**
 * 单条命中明细。WordMatcher 产出，ScanItem.matches 的元素。
 */
export interface FieldMatch {
  /** 命中在哪个字段，回指 ScanField.key */
  fieldKey: string;
  /** 命中的违禁词 */
  word: string;
}

/**
 * 扫描结果对象。scanner 每条商品产出一个。
 * 前端用 matches 渲染命中明细，用 scannedFields 回看原始文本（可选）。
 */
export interface ScanItem {
  productId: string;
  title: string;
  /** 本次扫描实际覆盖的字段清单（含文本）。用于结果区展示「扫了哪些字段」。 */
  scannedFields: ScanField[];
  /** 命中明细。空数组表示该商品无违禁。 */
  matches: FieldMatch[];
}
```

### 3.2 四个接口

```ts
/**
 * 第一段：数据源。拉取待扫描商品流。
 * 草稿箱 source 和上架商品 source 各实现一个。
 * 产出的 ScannableProduct 必须带齐所有「可能被扫」的字段原材料，
 * 具体扫哪些由 FieldExtractor 决定。
 */
export interface ScanSource {
  /** 稳定标识，用于配置、日志和 source 切换。如 'draft' / 'online' */
  readonly key: string;
  /** 流式产出商品。受 AbortSignal 控制，支持用户中途停止。 */
  stream(accountId: string, signal: AbortSignal): AsyncGenerator<ScannableProduct>;
}

/**
 * 商品载体。草稿箱商品和上架商品都装进这个结构。
 * 字段尽量带全，让 FieldExtractor 有料可抽。
 */
export interface ScannableProduct {
  productId: string;
  title: string;
  /** 商品描述纯文本（来自 desc_info.desc）。可能为空。 */
  desc?: string;
  /** 商品属性聚合文本（attrs 拼接）。可能为空。 */
  attrsText?: string;
  /** SKU 属性聚合文本（skus[].sku_attrs 拼接）。可能为空。 */
  skuAttrsText?: string;
  /** 来源标记，便于日志和结果展示区分。 */
  source: 'draft' | 'online';
}

/**
 * 第二段：字段提取器。从商品抽出可扫字段。
 * 「扫哪些字段」由实现决定（配置驱动），默认实现只取 title。
 */
export interface FieldExtractor {
  /** 声明本提取器会产出哪些字段 key。用于配置校验和 UI 展示。 */
  readonly fieldKeys: readonly string[];
  /** 从商品抽取待匹配字段清单。返回空数组表示该商品无可扫文本。 */
  extract(product: ScannableProduct): ScanField[];
}

/**
 * 第三段：匹配器。词库 × 字段文本 → 命中。
 * 默认实现是子串匹配（大小写不敏感），保持当前行为。
 * 后续可换正则匹配器、分词匹配器等，不影响其它三段。
 */
export interface WordMatcher {
  /** 对单个商品的所有字段做匹配，返回命中明细。 */
  match(fields: ScanField[], words: string[]): FieldMatch[];
}

/**
 * 第四段：处置动作。对命中商品执行处置。
 * 不在 scanner 管道内，由消费侧（批量收集后或逐个决策时）调用。
 */
export interface ResultAction {
  /** 稳定标识。如 'delete' / 'export' / 'mark' */
  readonly key: string;
  /** 执行处置。返回处置结果，供日志和 UI 回显。 */
  apply(item: ScanItem, ctx: ActionResultContext): Promise<ActionResult>;
}

export interface ActionResultContext {
  accountId: string;
  api: WxShopListingClient;
  addLog: AddLogFn;
  runId: string;
}

export interface ActionResult {
  /** 'success' | 'failed' | 'stopped'，复用现有语义 */
  status: 'success' | 'failed' | 'stopped';
  message?: string;
}
```

### 3.3 把四段串起来的 Scanner

```ts
/**
 * 扫描配置。一次扫描任务的完整参数。
 * 前端选好 source / fields / action 后，组装成这个对象传给 scanner。
 */
export interface ScanPlan {
  source: ScanSource;
  fields: FieldExtractor;
  matcher: WordMatcher;
  action: ResultAction;
  /** 扫描上限。undefined = 不限。 */
  limit?: number;
}

/**
 * 合规扫描器。把四段串成一条统一管道，
 * 对外只暴露一个 generator，逐条产出 ScanItem。
 * 批量模式 = 收集全部 ScanItem；逐个模式 = 逐条 yield。
 * 两种模式消费同一个 generator，不重复实现扫描逻辑。
 */
export interface ComplianceScanner {
  scan(accountId: string, plan: ScanPlan, signal: AbortSignal): AsyncGenerator<ScanItem>;
}
```

## 4. 默认实现 + 现有代码映射

### 4.1 默认实现清单

```ts
// ── 第一段：数据源 ──────────────────────────────────

/**
 * 草稿箱数据源。包装现有 streamDraftProducts，
 * 但要从 getProductDetail 拿全字段（不只是 title）。
 * 这要求扩 DraftProduct 类型 + getProductDetail 实现。
 */
class DraftBoxScanSource implements ScanSource {
  readonly key = 'draft';
  async *stream(accountId, signal) {
    const api = await getListingClient(accountId);
    for await (const p of streamDraftProducts(api, signal, accountId)) {
      yield toScannableProduct(p, 'draft');  // 字段聚合
    }
  }
}

/**
 * 上架商品数据源。【接口预留，本期不实现】
 * 实现需要 wxshop 接口拉 status=线上 的商品列表，当前 listing client 没有。
 * 文档里标注为 TODO，避免被误以为已完成。
 */
class OnlineProductScanSource implements ScanSource {
  readonly key = 'online';
  async *stream(): AsyncGenerator<ScannableProduct> {
    throw new Error('OnlineProductScanSource 尚未实现，仅接口预留');
  }
}

// ── 第二段：字段提取器 ──────────────────────────────

/**
 * 默认字段提取器：只取标题。
 * 本期默认配置 = 这个。行为完全等价现状。
 */
class TitleFieldExtractor implements FieldExtractor {
  readonly fieldKeys = ['title'] as const;
  extract(p: ScannableProduct): ScanField[] {
    return [{ key: 'title', label: '标题', text: p.title }];
  }
}

/**
 * 标题+描述提取器。【接口预留，本期默认不启用】
 * 后续想扫描述时，把 ScanPlan.fields 换成这个即可，
 * 无需改 matcher 或 source。
 */
class TitleDescFieldExtractor implements FieldExtractor {
  readonly fieldKeys = ['title', 'desc'] as const;
  extract(p: ScannableProduct): ScanField[] {
    const fields: ScanField[] = [{ key: 'title', label: '标题', text: p.title }];
    if (p.desc) fields.push({ key: 'desc', label: '描述', text: p.desc });
    return fields;
  }
}

// ── 第三段：匹配器 ──────────────────────────────────

/**
 * 子串匹配器。封装现有 findMatches 逻辑，
 * 改造成「多字段 × 词库」，产出 FieldMatch 明细。
 */
class SubstringMatcher implements WordMatcher {
  match(fields: ScanField[], words: string[]): FieldMatch[] {
    const result: FieldMatch[] = [];
    for (const field of fields) {
      const lower = field.text.toLowerCase();
      for (const word of words) {
        if (word && lower.includes(word.toLowerCase())) {
          result.push({ fieldKey: field.key, word });
        }
      }
    }
    return result;
  }
}

// ── 第四段：处置动作 ────────────────────────────────

/**
 * 删除处置。包装现有 deleteOne/batchDelete 逻辑。
 * 默认动作 = 删除，行为等价现状。
 */
class DeleteResultAction implements ResultAction {
  readonly key = 'delete';
  async apply(item, ctx): Promise<ActionResult> {
    // 复用现有 deleteOne 的限频 + errcode 处理
    const res = await deleteOne(ctx.api, ctx.addLog, toDraftProduct(item), ctx.runId, ctx.accountId);
    return { status: res, message: res === 'success' ? '已删除' : '删除失败' };
  }
}

/**
 * 导出处置。【接口预留，本期不实现】
 * 后续想做「扫描导出报告」时实现，把命中结果导出成文件。
 */
class ExportResultAction implements ResultAction {
  readonly key = 'export';
  async apply(): Promise<ActionResult> {
    throw new Error('ExportResultAction 尚未实现，仅接口预留');
  }
}
```

### 4.2 现有代码映射表

| 现有代码 | 处理方式 | 重构后归属 |
|---------|---------|-----------|
| `modules/compliance-detect.ts` 的 `findMatches` | 保留逻辑，移进 `SubstringMatcher` | `compliance/matcher/substring-matcher.ts` |
| `modules/fetch-draft-products.ts` 的 `streamDraftProducts` | 保留，作为 `DraftBoxScanSource` 内部调用 | `compliance/source/draft-box-source.ts` |
| `modules/compliance-detect.ts` 的 `scanOneByOne` | 删除，被 `ComplianceScanner.scan` generator 取代 | `compliance/scanner.ts` |
| `modules/compliance-detect.ts` 的 `batchScan` | 删除，批量模式 = 收集 scanner generator 全部结果 | `compliance/scanner.ts` 的消费侧 |
| `modules/delete-failed-products.ts` 的 `deleteOne` | 保留，被 `DeleteResultAction` 调用 | `compliance/action/delete-action.ts` |
| `modules/delete-failed-products.ts` 的 `batchDelete` | 删除，批量删除 = 循环调用 `action.apply` | scanner 消费侧 |
| `services/compliance-service.ts` 的 `runComplianceBatchScan` | 重写，改为组装 `ScanPlan` + 收集 scanner 结果 | `compliance/scanner.ts` 消费侧 |
| `services/compliance-service.ts` 的 `runComplianceStep` | 重写，改为组装 `ScanPlan` + 逐条 yield scanner | `compliance/scanner.ts` 消费侧 |
| `shared/types.ts` 的 `ViolationMatch` | 替换为 `ScanItem`（带 matches 明细） | `shared/types.ts` |
| `shared/types.ts` 的 `ViolationScanResult` | 调整，violations 类型改成 `ScanItem[]` | `shared/types.ts` |
| `wxshop/listing/api.ts` 的 `getProductDetail` | 扩字段，从 `edit_product` 多取 desc/attrs/sku | `wxshop/listing/api.ts` |
| `shared/types.ts` 的 `DraftProduct` | 扩字段，加 desc/attrsText/skuAttrsText | `shared/types.ts` |

### 4.3 目录结构

按现有分层规则（`modules/` 是底层算法，`services/` 是业务流程），合规域单独建一个子目录树：

```
src/background/compliance/                    ← 新建合规域目录
├── types.ts                  四个接口 + ScanItem 等类型（或放 shared/types.ts）
├── scanner.ts                ComplianceScanner 实现（串四段）
├── source/
│   ├── draft-box-source.ts   DraftBoxScanSource（默认）
│   └── online-source.ts      OnlineProductScanSource（预留）
├── extractor/
│   ├── title-extractor.ts    TitleFieldExtractor（默认）
│   └── title-desc-extractor.ts TitleDescFieldExtractor（预留）
├── matcher/
│   └── substring-matcher.ts  SubstringMatcher（默认，封装 findMatches）
└── action/
    ├── delete-action.ts      DeleteResultAction（默认）
    └── export-action.ts      ExportResultAction（预留）

src/background/modules/                       ← 现有目录
├── fetch-draft-products.ts   保留（source 调它）
└── delete-failed-products.ts 保留（delete action 调 deleteOne）

src/background/services/
└── compliance-service.ts     重写为 scanner 消费侧
```

**为什么 `compliance/` 和 `modules/` 并列而不是合并**：`modules/` 现在的定位是「跨域复用的底层算法」（`fetch-draft-products`、`delete-failed-products` 还会被商品提审模块用）。合规域自己的 source/extractor/matcher/action 是**合规专属**的，放到 `compliance/` 子树下更清晰，避免和跨域算法混在一起。

### 4.4 一个具体例子：批量扫描重构后的调用链

```ts
// services/compliance-service.ts 重写后
async function runComplianceBatchScan(accountId, sessions, limit?) {
  const words = await resolveScanWords();
  if (words.length === 0) return { scanned: 0, violations: [], errors: 0, stopped: false, reason: '词库为空' };

  // 组装 plan：全部用默认实现 → 行为等价现状
  const plan: ScanPlan = {
    source: new DraftBoxScanSource(),
    fields: new TitleFieldExtractor(),
    matcher: new SubstringMatcher(),
    action: new DeleteResultAction(),
    limit,
  };

  const signal = sessions.start(accountId, ...);
  const items: ScanItem[] = [];
  let scanned = 0;
  for await (const item of scanner.scan(accountId, plan, signal)) {
    scanned++;
    if (item.matches.length > 0) items.push(item);  // 批量模式只收集不处置
    if (limit && scanned >= limit) break;
  }
  return { scanned, violations: items, errors: 0, stopped: signal.aborted };
}
```

注意：**批量模式只收集 `ScanItem`，处置（删除）由前端用户勾选后单独触发** —— 这修掉了现在批量模式「扫完就自动收集但删除要二次操作」的割裂，让收集和处置彻底分离。

## 5. 前端 UI 调整

### 5.1 结果区表格：从「只看命中词」到「看命中字段+词」

现在表格两列（商品标题、匹配词）。改成三列，把命中字段下钻信息展示出来：

| 列 | 内容 | 说明 |
|----|------|------|
| 商品标题 | 高亮命中片段 | 标题列继续按 `matches` 里 `fieldKey==='title'` 的词高亮 |
| 命中明细 | 按**字段分组**展示 | 如 `[标题] xxx` `[描述] yyy`，一个商品可能命中多个字段 |
| 操作 | 删除 | 不变 |

**命中明细列的渲染规则**：
- 把 `item.matches` 按 `fieldKey` 分组。
- 每组前缀显示字段中文名（`标题`/`描述`），用 antd `Tag` 区分字段颜色。
- 同一字段的多个词用逗号分隔或多个小 tag。

因为本期默认只扫标题，实际只会有 `[标题]` 一组，但表格结构已支持多字段。后续开多字段扫描，无需改表格组件。

### 5.2 扫描配置区：新增「扫描范围」控件

现在配置区只有 `批量/逐个` 单选 + `上限`。新增一个**扫描范围**选择，让用户选 source 和字段集（虽然本期都只有一个选项，但控件先放好）：

```
┌─────────────────────────────────────────────────────┐
│ [草稿箱]  [批量扫描][逐个提示]   上限 [100] 条      │
│ 扫描字段 [☑ 标题]            ← 字段勾选，本期固定标题 │
└─────────────────────────────────────────────────────┘
```

**本期控件状态**：
- 扫描范围：只有「草稿箱」可选（上架商品 source 未实现，选项置灰或隐藏）。
- 扫描字段：只有「标题」可勾（描述等字段未实现 extractor，置灰）。
- 处置动作：暂不在配置区暴露，保持「删除」为默认（后续可加「导出」选项）。

**设计取舍**：本期选项很少，为什么还要把控件放出来？因为这些控件的**值**就是 `ScanPlan` 的参数来源。控件先在，后期能力上线时只需把选项激活，前端结构不用动。

### 5.3 前端类型对接

`ViolationMatch` → `ScanItem` 替换后，CompliancePage 里所有引用 `ViolationMatch` 的地方改为 `ScanItem`，`matchedWords` 改为 `matches`：

```ts
// 之前
record.matchedWords  // string[]

// 之后
record.matches       // FieldMatch[]
// 拿标题命中词：record.matches.filter(m => m.fieldKey === 'title').map(m => m.word)
```

`highlightTitle` 函数（按词高亮标题）的输入从 `matchedWords: string[]` 改为从 `matches` 里筛 `fieldKey==='title'` 的词，逻辑本身不变。

### 5.4 不改的部分

- **词库管理**（设置页的 ViolationWordsPanel）：完全不动。词库已全局化 + 默认词 + 分类，和扫描管道解耦，scanner 只通过 `resolveScanWords()` 拿合并词库。
- **逐个模式的弹窗**：结构不动，只把「匹配到违禁词」那块的渲染从 `matchedWords` 改成按字段分组的 `matches`。
- **执行日志区**：不动。日志是 addLog 产出的，和管道结构无关。

## 6. 迁移与删除（不需要兼容，旧代码直接删）

### 6.1 直接删除的文件/函数

| 删除对象 | 原因 |
|---------|------|
| `modules/compliance-detect.ts` 整个文件 | `findMatches` 移进 `SubstringMatcher`；`scanOneByOne`/`batchScan` 被 scanner 取代 |
| `modules/compliance-detect.ts` 导出的 `batchDeleteViolations` | 被 scanner 消费侧 + `DeleteResultAction` 取代 |
| `services/compliance-service.ts` 的 `runComplianceBatchScan` / `runComplianceStep` 旧实现 | 重写为 scanner 消费侧 |
| `shared/types.ts` 的 `ViolationMatch` 接口 | 被 `ScanItem` 取代 |

**注意**：`modules/fetch-draft-products.ts` 和 `modules/delete-failed-products.ts` **不删**，它们被新实现继续调用（source 调前者，delete action 调后者的 `deleteOne`）。只删 `compliance-detect.ts` 这个把两者焊在一起的「胶水文件」。

### 6.2 修改的文件（含删除 + 新增内容）

| 文件 | 动作 |
|------|------|
| `shared/types.ts` | 删 `ViolationMatch`；加 `ScanField` / `FieldMatch` / `ScanItem` / `ScannableProduct`；扩 `DraftProduct`（加 desc/attrsText/skuAttrsText）；`ViolationScanResult.violations` 类型改 `ScanItem[]` |
| `wxshop/listing/api.ts` | `getProductDetail` 从 `edit_product` 多取 `desc_info.desc`、attrs、sku_attrs 聚合到 `DraftProduct` |
| `services/compliance-service.ts` | 删旧实现，重写为 scanner 消费侧 |
| `pages/compliance/CompliancePage.tsx` | `ViolationMatch` → `ScanItem`；表格加命中字段分组列；配置区加扫描范围控件（本期选项受限） |

### 6.3 新增的文件

```
src/background/compliance/
├── types.ts                    四个接口 + ScanItem 等类型（或放 shared/types.ts）
├── scanner.ts                  ComplianceScanner 实现
├── source/
│   ├── draft-box-source.ts     DraftBoxScanSource（默认）
│   └── online-source.ts        OnlineProductScanSource（预留，抛错）
├── extractor/
│   ├── title-extractor.ts      TitleFieldExtractor（默认）
│   └── title-desc-extractor.ts TitleDescFieldExtractor（预留）
├── matcher/
│   └── substring-matcher.ts    SubstringMatcher（默认）
└── action/
    ├── delete-action.ts        DeleteResultAction（默认）
    └── export-action.ts        ExportResultAction（预留，抛错）
```

### 6.4 运行时 IPC 不变

**关键**：这一轮**不改 runtime channel**。`compliance:batchScan` / `compliance:scanStep` / `compliance:batchDelete` / `compliance:stop` 这四个 channel 完全不动，只是它们背后的 service 实现从「直接调 modules」换成「组装 ScanPlan + 调 scanner」。前端调 `extensionApi.compliance.*` 的方式不变。

这样保证：
- 前端 extension-api 层不动。
- runtime-channels 不动。
- router 注册不动。
- 只动 service 内部实现 + 页面渲染数据结构。

## 7. 行为不变性保证（重构安全性）

重构后默认配置（全用默认实现）的行为，**必须和现在完全一致**：

| 行为 | 现状 | 重构后默认 | 一致性 |
|------|------|-----------|--------|
| 数据来源 | 草稿箱 `status=0` | `DraftBoxScanSource` → `streamDraftProducts`（同样 `status=0`） | ✅ |
| 扫描字段 | 只 title | `TitleFieldExtractor` 只取 title | ✅ |
| 匹配方式 | 子串、大小写不敏感 | `SubstringMatcher` 同样逻辑 | ✅ |
| 处置动作 | 删除草稿 | `DeleteResultAction` → `deleteOne` | ✅ |
| 命中后日志 | addLog failed | scanner 消费侧同样 addLog | ✅ |
| 批量模式 | 收集 violations | 收集 ScanItem（只收集不处置） | ✅（结构变，行为同） |
| 逐个模式 | generator 逐条 yield | scanner.scan generator 逐条 yield | ✅ |

唯一的行为变化是**结果对象结构**（`ViolationMatch` → `ScanItem`），这是用户要求的「带命中字段下钻」——不算兼容性问题，是预期改进。

## 8. 后续扩展指引

文档定下接口后，后续每加一种能力都只动一个实现位，其它三段不动：

| 想加的能力 | 要做的事 | 不需要动的 |
|-----------|---------|-----------|
| 扫上架商品 | 实现 `OnlineProductScanSource`，前端激活「上架商品」选项 | FieldExtractor / Matcher / Action |
| 扫商品描述 | 把 `ScanPlan.fields` 换成 `TitleDescFieldExtractor`，前端激活「描述」勾选 | Source / Matcher / Action |
| 正则匹配 | 新增 `RegexMatcher`，把 `ScanPlan.matcher` 换掉 | Source / Extractor / Action |
| 导出报告而非删除 | 实现 `ExportResultAction`，前端配置区加「导出」选项 | Source / Extractor / Matcher |

这是这套架构的核心价值：**扩展点是平行的，加一种能力不碰其它能力。**
