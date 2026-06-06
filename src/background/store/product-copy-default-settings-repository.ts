import type {
  ProductCopyContentSettings,
  ProductCopyDefaultSettings,
  ProductCopyDefaultSettingsPatch,
  ProductCopyPriceRounding,
  ProductCopyPricingSettings,
  ProductCopySkuSettings,
} from '../../shared/types.ts';
import { extensionDb } from '../db/extension-db.ts';

const DEFAULT_STOCK_NUM = 999;

const DEFAULT_PRICING: ProductCopyPricingSettings = {
  multiplier: 1,
  addAmountFen: 0,
  rounding: 'cent',
};

const DEFAULT_CONTENT: ProductCopyContentSettings = {
  titlePrefix: '',
  titleSuffix: '',
  mainImageSkipFirst: 0,
  mainImageSkipLast: 0,
  detailImageSkipFirst: 0,
  detailImageSkipLast: 0,
};

const DEFAULT_SKU: ProductCopySkuSettings = {
  defaultStockNum: DEFAULT_STOCK_NUM,
};

// 默认参数会被前端表单、草稿生成服务和测试流程复用。
// 这里统一做归一化，避免 UI 传入空字符串或非法数字后污染持久化配置。
function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function normalizeNonNegativeInteger(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : fallback;
}

function normalizeOptionalNonNegativeInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : undefined;
}

function normalizeRounding(value: unknown): ProductCopyPriceRounding {
  return value === 'jiao' || value === 'yuan' ? value : 'cent';
}

function normalizePricing(value?: Partial<ProductCopyPricingSettings>): ProductCopyPricingSettings {
  return {
    multiplier: normalizePositiveNumber(value?.multiplier, DEFAULT_PRICING.multiplier),
    addAmountFen: normalizeNonNegativeInteger(value?.addAmountFen, DEFAULT_PRICING.addAmountFen),
    rounding: normalizeRounding(value?.rounding),
  };
}

function normalizeContent(value?: Partial<ProductCopyContentSettings>): ProductCopyContentSettings {
  const maxDetailImages = normalizeOptionalNonNegativeInteger(value?.maxDetailImages);
  return {
    titlePrefix: normalizeText(value?.titlePrefix),
    titleSuffix: normalizeText(value?.titleSuffix),
    mainImageSkipFirst: normalizeNonNegativeInteger(value?.mainImageSkipFirst),
    mainImageSkipLast: normalizeNonNegativeInteger(value?.mainImageSkipLast),
    detailImageSkipFirst: normalizeNonNegativeInteger(value?.detailImageSkipFirst),
    detailImageSkipLast: normalizeNonNegativeInteger(value?.detailImageSkipLast),
    ...(maxDetailImages === undefined ? {} : { maxDetailImages }),
  };
}

function normalizeSku(value?: Partial<ProductCopySkuSettings>): ProductCopySkuSettings {
  const unifiedStockNum = normalizeOptionalNonNegativeInteger(value?.unifiedStockNum);
  const zeroStockReplacement = normalizeOptionalNonNegativeInteger(value?.zeroStockReplacement);
  const minSkuPriceFen = normalizeOptionalNonNegativeInteger(value?.minSkuPriceFen);
  return {
    defaultStockNum: normalizeNonNegativeInteger(value?.defaultStockNum, DEFAULT_STOCK_NUM),
    ...(unifiedStockNum === undefined ? {} : { unifiedStockNum }),
    ...(zeroStockReplacement === undefined ? {} : { zeroStockReplacement }),
    ...(minSkuPriceFen === undefined ? {} : { minSkuPriceFen }),
  };
}

export function defaultProductCopySettings(accountId: string): ProductCopyDefaultSettings {
  return {
    accountId,
    autoSourceBinding: true,
    pricing: DEFAULT_PRICING,
    content: DEFAULT_CONTENT,
    sku: DEFAULT_SKU,
    updatedAt: 0,
  };
}

// 保存时只接受业务语义上的最终参数，不在 UI 或 service 中散落兼容逻辑。
// 这样后续继续扩展 1688 链路时，也能复用同一套默认参数结构。
export function normalizeProductCopyDefaultSettings(
  accountId: string,
  patch: ProductCopyDefaultSettingsPatch = {},
  updatedAt = Date.now(),
): ProductCopyDefaultSettings {
  return {
    accountId,
    expressTemplateId: normalizeText(patch.expressTemplateId) || undefined,
    afterSaleAddressId: normalizeText(patch.afterSaleAddressId) || undefined,
    brandId: normalizeText(patch.brandId) || undefined,
    autoSourceBinding: patch.autoSourceBinding !== false,
    pricing: normalizePricing(patch.pricing),
    content: normalizeContent(patch.content),
    sku: normalizeSku(patch.sku),
    updatedAt,
  };
}

export async function getProductCopyDefaultSettings(accountId: string): Promise<ProductCopyDefaultSettings> {
  const stored = await extensionDb.productCopyDefaultSettings.get(accountId);
  if (!stored) return defaultProductCopySettings(accountId);
  return normalizeProductCopyDefaultSettings(accountId, stored, stored.updatedAt);
}

export async function saveProductCopyDefaultSettings(
  accountId: string,
  patch: ProductCopyDefaultSettingsPatch,
): Promise<ProductCopyDefaultSettings> {
  const normalized = normalizeProductCopyDefaultSettings(accountId, patch);
  await extensionDb.productCopyDefaultSettings.put(normalized);
  return normalized;
}
