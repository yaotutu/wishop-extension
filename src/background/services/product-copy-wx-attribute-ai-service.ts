import type { AppSettings } from '../../shared/settings.ts';
import type {
  ProductCopyRecord,
  WxProductDraftAttribute,
} from '../../shared/types.ts';
import type { OpenAiCompatibleChatMessage, OpenAiCompatibleJsonCompletionInput } from '../ai/openai-compatible-client.ts';
import { createOpenAiCompatibleJsonCompletion, createOpenAiCompatibleTimeoutFetcher } from '../ai/openai-compatible-client.ts';
import type {
  WxShopCategoryProductAttrRule,
  WxShopCategoryProductRule,
} from '../wxshop/listing/types.ts';

type CompleteJson = (input: OpenAiCompatibleJsonCompletionInput) => Promise<unknown>;

export interface GenerateRuleDrivenWxProductAttributesInput {
  copyId: string;
  listing: ProductCopyRecord;
  categoryRule: WxShopCategoryProductRule;
  providedAttrs?: WxProductDraftAttribute[];
}

export interface GenerateRuleDrivenWxProductAttributesDependencies {
  getSettings?: () => Promise<AppSettings>;
  completeJson?: CompleteJson;
}

export interface GenerateRuleDrivenWxProductAttributesResult {
  attrs: WxProductDraftAttribute[];
  warnings: string[];
  requiredAttrCount: number;
  aiAttrCount: number;
}

const LLM_TIMEOUT_MS = 90_000;
const MAX_PROMPT_PARAMS = 120;
const MAX_PROMPT_SKU_GROUPS = 20;
const MAX_PROMPT_SKU_ROWS = 40;
const MAX_PROMPT_DETAIL_TEXT_LENGTH = 1200;
const MAX_AI_ATTRS = 120;

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)));
}

function requiredProductRules(categoryRule: WxShopCategoryProductRule): WxShopCategoryProductAttrRule[] {
  return categoryRule.productAttrs.filter(rule => rule.required && normalizeText(rule.name));
}

function rulePayload(rule: WxShopCategoryProductAttrRule): Record<string, unknown> {
  return {
    name: rule.name,
    type: rule.type,
    required: rule.required,
    values: rule.values,
    appendAllowed: rule.appendAllowed,
    hint: rule.hint,
  };
}

function normalizeProvidedAttrs(attrs: WxProductDraftAttribute[] = []): WxProductDraftAttribute[] {
  return attrs
    .map(attr => ({
      attrKey: normalizeText(attr.attrKey),
      attrValue: normalizeText(attr.attrValue),
    }))
    .filter(attr => attr.attrKey && attr.attrValue);
}

function productFactsForPrompt(input: GenerateRuleDrivenWxProductAttributesInput): Record<string, unknown> {
  const listing = input.listing;
  const sourceCategory = listing.category.source;
  return {
    sourcePlatform: listing.identity.platform,
    sourceItemId: listing.identity.itemId,
    sourceUrl: listing.sourceUrl,
    title: listing.title,
    sourceCategory: sourceCategory ? {
      id: sourceCategory.id,
      name: sourceCategory.name,
      path: sourceCategory.path,
    } : null,
    price: listing.price.rangeText,
    delivery: listing.delivery.text,
    detailText: listing.detail.text.slice(0, MAX_PROMPT_DETAIL_TEXT_LENGTH),
    productParams: listing.params.slice(0, MAX_PROMPT_PARAMS).map(param => ({
      name: param.name,
      value: param.value,
      group: param.group,
    })),
    skuGroups: listing.sku.groups.slice(0, MAX_PROMPT_SKU_GROUPS).map(group => ({
      name: group.name,
      values: group.values,
    })),
    skuRows: listing.sku.matrix.slice(0, MAX_PROMPT_SKU_ROWS).map(sku => ({
      priceText: sku.priceText,
      stockText: sku.stockText,
      specs: sku.specs.map(spec => ({ name: spec.name, value: spec.value })),
    })),
    priorAttrsFromCategoryStep: normalizeProvidedAttrs(input.providedAttrs),
  };
}

/**
 * 参数补齐只把“必填规则”交给 AI。可选参数不进入本轮输出范围，
 * 这样可以把提交给微信的参数面控制在真正会阻断发品的字段上。
 */
function buildAttributeMessages(input: GenerateRuleDrivenWxProductAttributesInput): OpenAiCompatibleChatMessage[] {
  const requiredRules = requiredProductRules(input.categoryRule);
  return [
    {
      role: 'system',
      content: [
        '你是微信小店商品参数补齐助手，只输出 JSON。',
        '任务：根据用户 JSON 里的淘宝采集商品信息和微信小店类目必填规则，生成微信新增商品接口需要提交的商品参数。',
        '必须为 requiredProductAttrs 中的每一个 name 输出一条 attrs，attrKey 必须完全等于微信规则 name。',
        '不要输出 requiredProductAttrs 之外的属性，不要编造属性名，不要解释过程。',
        'select_one 参数如果 values 非空且 appendAllowed=false，attrValue 必须完全等于 values 中的一个值。',
        'select_many 参数如果 values 非空且 appendAllowed=false，多个值用英文分号 ; 连接，且每个值都必须来自 values。',
        'integer_unit 和 decimal4_unit 参数必须使用数字加允许单位，例如 10只、0.5kg。',
        '优先使用标题、商品参数、SKU 规格里的确定信息；确实缺失时可以给保守值，但必须在 warnings 写明需要草稿箱复核。',
        'JSON schema: {"attrs":[{"attrKey":"微信规则name","attrValue":"提交给微信的值"}],"warnings":["需要人工复核的点"]}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        copyId: input.copyId,
        categoryRule: {
          catId: input.categoryRule.catId,
          requiredProductAttrs: requiredRules.map(rulePayload),
        },
        product: productFactsForPrompt(input),
      }),
    },
  ];
}

function normalizeWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.map(item => normalizeText(item)));
}

function normalizeAiAttrs(payload: unknown): WxProductDraftAttribute[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  if (!Array.isArray(record.attrs)) {
    throw new Error('AI 服务商品参数补齐结果缺少 attrs 数组');
  }

  const attrs: WxProductDraftAttribute[] = [];
  for (const item of record.attrs.slice(0, MAX_AI_ATTRS)) {
    if (!item || typeof item !== 'object') continue;
    const attrRecord = item as Record<string, unknown>;
    const attrKey = normalizeText(attrRecord.attrKey);
    const attrValue = normalizeText(attrRecord.attrValue);
    if (!attrKey || !attrValue) {
      throw new Error('AI 服务商品参数补齐结果包含空参数名或空参数值');
    }
    attrs.push({ attrKey, attrValue });
  }
  return attrs;
}

function escapedRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitSelectManyValue(value: string): string[] {
  return uniqueStrings(value.split(/[;；,，、]/u));
}

function isSelectRule(rule: WxShopCategoryProductAttrRule): boolean {
  return /select/u.test(rule.type);
}

/**
 * 微信枚举参数不能靠代码替用户改成“其他”。
 * AI 输出之后在本地按缓存规则硬校验，不合法就阻断，避免再次把错误请求打到微信接口。
 */
function validateEnumValue(rule: WxShopCategoryProductAttrRule, attrValue: string): void {
  if (!isSelectRule(rule) || rule.values.length === 0 || rule.appendAllowed) return;
  const allowed = new Set(rule.values);
  const values = /select_many/u.test(rule.type) ? splitSelectManyValue(attrValue) : [attrValue];
  const invalid = values.filter(value => !allowed.has(value));
  if (invalid.length > 0) {
    throw new Error(`商品参数「${rule.name}」值「${invalid.join('、')}」不在微信允许值内，期望值为：${rule.values.join('；')}`);
  }
}

/**
 * integer_unit / decimal4_unit 是微信规则里带单位的数值字段。
 * 这里只验证“数字 + 微信允许单位”的外形，具体业务合理性留给草稿箱复核。
 */
function validateUnitValue(rule: WxShopCategoryProductAttrRule, attrValue: string): void {
  if (!/unit/u.test(rule.type) || rule.values.length === 0) return;
  const unitPattern = rule.values.map(escapedRegExp).join('|');
  const integerPattern = new RegExp(`^\\d+\\s*(?:${unitPattern})$`, 'u');
  const decimalPattern = new RegExp(`^\\d+(?:\\.\\d{1,4})?\\s*(?:${unitPattern})$`, 'u');
  const matched = /integer/u.test(rule.type) ? integerPattern.test(attrValue) : decimalPattern.test(attrValue);
  if (!matched) {
    throw new Error(`商品参数「${rule.name}」值「${attrValue}」不符合微信单位规则，必须使用数字加单位：${rule.values.join('、')}`);
  }
}

/**
 * 本地缓存的微信类目规则是最终验收标准：
 * AI 不能返回规则外字段，不能漏必填字段，也不能绕过枚举/单位约束。
 */
function validateRuleDrivenAttrs(input: {
  categoryRule: WxShopCategoryProductRule;
  attrs: WxProductDraftAttribute[];
}): WxProductDraftAttribute[] {
  const rulesByName = new Map(input.categoryRule.productAttrs.map(rule => [normalizeText(rule.name), rule]));
  const requiredNames = requiredProductRules(input.categoryRule).map(rule => normalizeText(rule.name));
  const attrsByName = new Map<string, WxProductDraftAttribute>();

  for (const attr of input.attrs) {
    const attrKey = normalizeText(attr.attrKey);
    const attrValue = normalizeText(attr.attrValue);
    const rule = rulesByName.get(attrKey);
    if (!rule) throw new Error(`AI 服务返回了类目规则外的商品参数「${attrKey}」`);
    if (attrsByName.has(attrKey)) throw new Error(`AI 服务重复返回商品参数「${attrKey}」`);
    validateEnumValue(rule, attrValue);
    validateUnitValue(rule, attrValue);
    attrsByName.set(attrKey, { attrKey, attrValue });
  }

  const missingRequiredNames = requiredNames.filter(name => !attrsByName.has(name));
  if (missingRequiredNames.length > 0) {
    throw new Error(`AI 服务未补齐微信必填商品参数：${missingRequiredNames.join('、')}`);
  }

  return requiredNames.map(name => attrsByName.get(name)).filter((attr): attr is WxProductDraftAttribute => Boolean(attr));
}

async function defaultGetSettings(): Promise<AppSettings> {
  const repository = await import('../store/settings-repository.ts');
  return repository.getAppSettings();
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * 根据“本地微信类目规则 + 淘宝采集信息”生成最终商品参数。
 * 这个函数是复制商品流程里唯一的商品参数补齐入口，禁止在调用方再追加字段名猜测或默认兜底。
 */
export async function generateRuleDrivenWxProductAttributes(
  input: GenerateRuleDrivenWxProductAttributesInput,
  dependencies: GenerateRuleDrivenWxProductAttributesDependencies = {},
): Promise<GenerateRuleDrivenWxProductAttributesResult> {
  const requiredRules = requiredProductRules(input.categoryRule);
  if (requiredRules.length === 0) {
    return {
      attrs: [],
      warnings: [],
      requiredAttrCount: 0,
      aiAttrCount: 0,
    };
  }

  const settings = await (dependencies.getSettings || defaultGetSettings)();
  const aiSettings = settings.aiService;
  if (!aiSettings.apiKey.trim()) throw new Error('请先在设置里填写 AI 服务 API Key');
  if (!aiSettings.baseUrl.trim()) throw new Error('请先在设置里填写 OpenAI 兼容地址');

  let payload: unknown;
  try {
    const completeJson = dependencies.completeJson || createOpenAiCompatibleJsonCompletion;
    payload = await completeJson({
      baseUrl: aiSettings.baseUrl,
      apiKey: aiSettings.apiKey,
      model: aiSettings.model,
      messages: buildAttributeMessages(input),
      temperature: 0.1,
      maxTokens: 1800,
      fetcher: dependencies.completeJson ? undefined : createOpenAiCompatibleTimeoutFetcher({
        timeoutMs: LLM_TIMEOUT_MS,
        timeoutMessage: `AI 服务商品参数补齐请求超过 ${Math.round(LLM_TIMEOUT_MS / 1000)} 秒未返回，已取消`,
      }),
    });
  } catch (error) {
    throw new Error(`AI 服务商品参数补齐失败：${errorMessage(error, '未知错误')}`);
  }

  const attrs = validateRuleDrivenAttrs({
    categoryRule: input.categoryRule,
    attrs: normalizeAiAttrs(payload),
  });
  const warnings = normalizeWarnings((payload as Record<string, unknown> | null)?.warnings);
  return {
    attrs,
    warnings: uniqueStrings([
      ...warnings,
      `AI 已按微信类目规则补齐 ${attrs.length}/${requiredRules.length} 个必填商品参数，请在草稿箱复核。`,
    ]),
    requiredAttrCount: requiredRules.length,
    aiAttrCount: attrs.length,
  };
}
