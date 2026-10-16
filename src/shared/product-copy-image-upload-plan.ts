import type {
  ProductCopyContentSettings,
  ProductCopyPricingSettings,
  ProductCopyRecord,
  ProductCopySkuSettings,
  TaobaoProductImageAsset,
  TaobaoProductImageRole,
  TaobaoProductSkuMatrixItem,
} from './types.ts';

const WX_HEAD_IMAGE_MAX_COUNT = 9;
const WX_DETAIL_IMAGE_MAX_COUNT = 80;
const WX_SKU_MAX_COUNT = 500;
const DEFAULT_WX_STOCK_NUM = 999;

export interface ProductCopyImageUploadPlanOptions {
  pricing?: ProductCopyPricingSettings;
  content?: ProductCopyContentSettings;
  sku?: ProductCopySkuSettings;
}

export interface ProductCopyImageUploadPlanSource {
  sourceUrl: string;
  role: TaobaoProductImageRole;
  candidates: string[];
}

interface ResolvedSkuInput {
  sku: TaobaoProductSkuMatrixItem;
  salePrice: number;
  stockNum: number;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function normalizeImageCandidate(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('//') ? `https:${trimmed}` : trimmed.replace(/^http:\/\//i, 'https://');
}

function normalizeTaobaoImageIdentity(rawUrl: string): string {
  return normalizeImageCandidate(rawUrl)
    .replace(/~(?:crop|tplv|resize|q\d+|webp)[^~?#]*~/iu, '')
    .replace(/(\.(?:jpe?g|png|webp|gif))_(?:\d+x\d+(?:q\d+)?|q\d+|sum|webp)\.(?:jpe?g|png|webp|gif)_?(?:\.(?:webp))?(?=$|[?#])/iu, '$1')
    .replace(/_(?:\d+x\d+(?:q\d+)?|sum|webp)\.(jpe?g|png|webp|gif)(?=$|[?#])/iu, '.$1');
}

function normalizeNonNegativeInteger(value: number | undefined): number | undefined {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}

function normalizeSkuSettings(defaultStockNum?: number, settings?: ProductCopySkuSettings): Required<Pick<ProductCopySkuSettings, 'defaultStockNum'>>
  & Partial<Pick<ProductCopySkuSettings, 'unifiedStockNum' | 'zeroStockReplacement' | 'minSkuPriceFen'>> {
  return {
    defaultStockNum: settings?.defaultStockNum ?? defaultStockNum ?? DEFAULT_WX_STOCK_NUM,
    unifiedStockNum: normalizeNonNegativeInteger(settings?.unifiedStockNum),
    zeroStockReplacement: normalizeNonNegativeInteger(settings?.zeroStockReplacement),
    minSkuPriceFen: normalizeNonNegativeInteger(settings?.minSkuPriceFen),
  };
}

function normalizeImageCount(value: number | undefined): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

function selectImages(
  sourceImages: string[],
  options: {
    skipFirst?: number;
    skipLast?: number;
    max?: number;
  },
): string[] {
  const unique = uniqueStrings(sourceImages);
  const skipFirst = normalizeImageCount(options.skipFirst);
  const skipLast = normalizeImageCount(options.skipLast);
  const end = skipLast > 0 ? Math.max(skipFirst, unique.length - skipLast) : unique.length;
  const selected = unique.slice(skipFirst, end);
  return options.max === undefined ? selected : selected.slice(0, Math.max(0, options.max));
}

function resolveMainSourceImages(listing: ProductCopyRecord, content?: ProductCopyContentSettings): string[] {
  return selectImages(listing.images.main, {
    skipFirst: content?.mainImageSkipFirst,
    skipLast: content?.mainImageSkipLast,
    max: WX_HEAD_IMAGE_MAX_COUNT,
  });
}

function resolveDetailSourceImages(listing: ProductCopyRecord, mainSourceImages: string[], content?: ProductCopyContentSettings): string[] {
  const mainImageSet = new Set(mainSourceImages);
  return selectImages(listing.images.detail, {
    skipFirst: content?.detailImageSkipFirst,
    skipLast: content?.detailImageSkipLast,
    max: content?.maxDetailImages ?? WX_DETAIL_IMAGE_MAX_COUNT,
  }).filter(url => !mainImageSet.has(url)).slice(0, WX_DETAIL_IMAGE_MAX_COUNT);
}

function normalizePricing(settings?: ProductCopyPricingSettings): ProductCopyPricingSettings {
  return {
    multiplier: Number.isFinite(settings?.multiplier) && Number(settings?.multiplier) > 0 ? Number(settings?.multiplier) : 1,
    addAmountFen: Number.isInteger(settings?.addAmountFen) && Number(settings?.addAmountFen) >= 0 ? Number(settings?.addAmountFen) : 0,
    rounding: settings?.rounding === 'jiao' || settings?.rounding === 'yuan' ? settings.rounding : 'cent',
  };
}

function roundPriceFen(priceFen: number, rounding: ProductCopyPricingSettings['rounding']): number {
  if (rounding === 'yuan') return Math.floor(priceFen / 100) * 100;
  if (rounding === 'jiao') return Math.floor(priceFen / 10) * 10;
  return Math.round(priceFen);
}

function adjustedPriceInFen(priceFen: number, pricing?: ProductCopyPricingSettings): number {
  const normalized = normalizePricing(pricing);
  return roundPriceFen(priceFen * normalized.multiplier + normalized.addAmountFen, normalized.rounding);
}

function parseMoneyToFen(text: string): number | undefined {
  const match = text.replace(/\s+/g, ' ').trim().match(/(?:¥|￥)?\s*(\d+(?:[.．]\d{1,2})?)/u);
  if (!match?.[1]) return undefined;
  return Math.round(Number(match[1].replace('．', '.')) * 100);
}

function skuPriceInFen(sku: TaobaoProductSkuMatrixItem, listing: ProductCopyRecord): number {
  return sku.priceMoney ?? parseMoneyToFen(sku.priceText) ?? parseMoneyToFen(listing.price.rangeText) ?? 1;
}

function resolvedSkuStockNum(
  sku: TaobaoProductSkuMatrixItem,
  settings: ReturnType<typeof normalizeSkuSettings>,
): number {
  if (settings.unifiedStockNum !== undefined) return settings.unifiedStockNum;
  if ((sku.quantity ?? 0) === 0 && settings.zeroStockReplacement !== undefined) return settings.zeroStockReplacement;
  return sku.quantity ?? settings.defaultStockNum;
}

function resolveSkuInputs(
  listing: ProductCopyRecord,
  skuSettings: ReturnType<typeof normalizeSkuSettings>,
  pricing?: ProductCopyPricingSettings,
): ResolvedSkuInput[] {
  return listing.sku.matrix.slice(0, WX_SKU_MAX_COUNT)
    .map(sku => ({
      sku,
      salePrice: adjustedPriceInFen(skuPriceInFen(sku, listing), pricing),
      stockNum: resolvedSkuStockNum(sku, skuSettings),
    }))
    .filter(sku => skuSettings.minSkuPriceFen === undefined || sku.salePrice >= skuSettings.minSkuPriceFen);
}

function assetMatchesSource(asset: TaobaoProductImageAsset, sourceUrl: string): boolean {
  const normalizedSourceUrl = normalizeImageCandidate(sourceUrl);
  const sourceImageIdentity = normalizeTaobaoImageIdentity(sourceUrl);
  if (normalizeImageCandidate(asset.url) === normalizedSourceUrl) return true;
  if (normalizeImageCandidate(asset.normalizedUrl) === normalizedSourceUrl) return true;
  if (Object.values(asset.lazyAttrs || {}).some(value => normalizeImageCandidate(value) === normalizedSourceUrl)) return true;
  if (normalizeTaobaoImageIdentity(asset.url) === sourceImageIdentity) return true;
  if (normalizeTaobaoImageIdentity(asset.normalizedUrl) === sourceImageIdentity) return true;
  return Object.values(asset.lazyAttrs || {}).some(value => normalizeTaobaoImageIdentity(value) === sourceImageIdentity);
}

function candidatesFromAsset(asset: TaobaoProductImageAsset): string[] {
  return uniqueStrings([
    // 页面真实记录的原始 URL 往往是浏览器实际加载过的尺寸图，比强行还原出的“原图”更稳定。
    normalizeImageCandidate(asset.url),
    normalizeImageCandidate(asset.lazyAttrs?.src || ''),
    normalizeImageCandidate(asset.lazyAttrs?.['data-src'] || ''),
    normalizeImageCandidate(asset.lazyAttrs?.['data-ks-lazyload'] || ''),
    normalizeImageCandidate(asset.lazyAttrs?.['data-original'] || ''),
    normalizeImageCandidate(asset.lazyAttrs?.['data-lazy-src'] || ''),
    normalizeImageCandidate(asset.normalizedUrl),
  ]);
}

function resolveImageRole(listing: ProductCopyRecord, sourceUrl: string): TaobaoProductImageRole {
  const matchedAsset = listing.images.assets.find(asset => assetMatchesSource(asset, sourceUrl));
  if (matchedAsset?.role) return matchedAsset.role;
  if (listing.images.main.includes(sourceUrl)) return 'main';
  if (listing.images.detail.includes(sourceUrl)) return 'detail';
  if (listing.sku.matrix.some(sku => sku.imageUrl === sourceUrl)) return 'sku';
  return 'unknown';
}

function resolveImageCandidates(listing: ProductCopyRecord, sourceUrl: string): string[] {
  const matchedAssets = listing.images.assets.filter(asset => assetMatchesSource(asset, sourceUrl));
  return uniqueStrings([
    ...matchedAssets.flatMap(candidatesFromAsset),
    normalizeImageCandidate(sourceUrl),
  ]);
}

export function collectProductCopyUploadSourceImages(
  listing: ProductCopyRecord,
  options: ProductCopyImageUploadPlanOptions = {},
): string[] {
  const mainImages = resolveMainSourceImages(listing, options.content);
  const detailImages = resolveDetailSourceImages(listing, mainImages, options.content);
  const skuSettings = normalizeSkuSettings(options.sku?.defaultStockNum, options.sku);
  const resolvedSkus = resolveSkuInputs(listing, skuSettings, options.pricing);
  return uniqueStrings([
    ...mainImages,
    ...detailImages,
    ...resolvedSkus.map(item => item.sku.imageUrl).filter(Boolean),
  ]);
}

export function buildProductCopyImageUploadPlan(
  listing: ProductCopyRecord,
  options: ProductCopyImageUploadPlanOptions = {},
): ProductCopyImageUploadPlanSource[] {
  return collectProductCopyUploadSourceImages(listing, options).map(sourceUrl => ({
    sourceUrl,
    role: resolveImageRole(listing, sourceUrl),
    candidates: resolveImageCandidates(listing, sourceUrl),
  }));
}
