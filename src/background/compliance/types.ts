/**
 * 商品合规扫描三段式管道的类型定义。
 *
 * 设计目标：把「拿到数据 → 关键词匹配 → 输出结果」抽象成四个可替换接口，
 * 组成一条管道：
 *   ScanSource → FieldExtractor → WordMatcher → ScanItem
 *                                              └→ ResultAction（消费侧处置）
 *
 * 详见 docs/superpowers/specs/2026-06-20-compliance-scanner-pipeline-design.md。
 *
 * 关键约束：ResultAction 不在 scanner 管道内，由消费侧（批量收集后或逐个决策时）调用。
 * 这样批量模式可以「只扫不删」，逐个模式可以「边扫边删」，都复用同一个 scanner。
 */
import type { AddLogFn, ScanField, ScanItem, FieldMatch } from '../../shared/types';
import type { WxShopListingClient } from '../wxshop/listing/types';

// 重新导出跨前后端的数据结构，让 compliance 域内统一从这里引用。
export type { ScanField, ScanItem, FieldMatch };

// ── 核心数据结构 ──────────────────────────────────────

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

// ── 四个可替换接口 ────────────────────────────────────

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
 * 处置动作执行上下文。ResultAction.apply 的第二参数，
 * 把执行处置所需的依赖集中传进来，避免 action 自己再去拿 client / 写日志。
 */
export interface ActionResultContext {
  accountId: string;
  api: WxShopListingClient;
  addLog: AddLogFn;
  runId: string;
}

/** 处置结果。复用现有 'success' | 'failed' | 'stopped' 语义。 */
export interface ActionResult {
  status: 'success' | 'failed' | 'stopped';
  message?: string;
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

// ── 把四段串起来的 Scanner ────────────────────────────

/**
 * 扫描配置。一次扫描任务的完整参数。
 * 前端选好 source / fields / action 后，组装成这个对象传给 scanner。
 *
 * 注意：词库（words）不在 plan 里，而在 scanner.scan() 调用时单独传入。
 * 词库由消费侧（service）调 resolveScanWords() 解析一次后传入，
 * 避免每次扫描都重复解析，也让词库变更只影响下一次 scan。
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
  scan(accountId: string, plan: ScanPlan, words: string[], signal: AbortSignal): AsyncGenerator<ScanItem>;
}
