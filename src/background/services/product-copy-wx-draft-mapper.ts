import type {
  ProductCopyContentSettings,
  ProductCopyPricingSettings,
  ProductCopyRecord,
  ProductCopySkuSettings,
  TaobaoProductSkuMatrixItem,
  WxProductDraftAttribute,
} from '../../shared/types.ts';
import type {
  WxShopAddProductAttr,
  WxShopAddProductRequest,
  WxShopAddProductSku,
} from '../wxshop/listing/types.ts';

const WX_TITLE_MAX_LENGTH = 60;
const WX_SHORT_TITLE_MAX_LENGTH = 20;
const WX_HEAD_IMAGE_MIN_COUNT = 3;
const WX_HEAD_IMAGE_MAX_COUNT = 9;
const WX_DETAIL_IMAGE_MAX_COUNT = 80;
const WX_SKU_MAX_COUNT = 500;
const DEFAULT_WX_STOCK_NUM = 999;
const DEFAULT_BRAND_ID = '2100000000';
const WX_CATEGORY_MIN_DEPTH = 3;
const WX_CATEGORY_MAX_DEPTH = 4;
const EMOJI_CHARACTER_PATTERN = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{20E3}]/gu;

export interface ProductCopyWxDraftMappingOptions {
  catIds: string[];
  expressTemplateId?: string;
  afterSaleAddressId?: string;
  brandId?: string;
  defaultStockNum?: number;
  pricing?: ProductCopyPricingSettings;
  content?: ProductCopyContentSettings;
  sku?: ProductCopySkuSettings;
  attrs?: WxProductDraftAttribute[];
  uploadedImages: Map<string, string> | Record<string, string>;
}

interface ProductCopyWxDraftSourceImageOptions {
  pricing?: ProductCopyPricingSettings;
  content?: ProductCopyContentSettings;
  sku?: ProductCopySkuSettings;
}

interface ResolvedSkuInput {
  sku: TaobaoProductSkuMatrixItem;
  salePrice: number;
  stockNum: number;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeWxText(value: string): string {
  return normalizeText(value.replace(EMOJI_CHARACTER_PATTERN, ''));
}

function truncateText(value: string, maxLength: number): string {
  return Array.from(normalizeText(value)).slice(0, maxLength).join('');
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function lookupUploadedImage(uploadedImages: Map<string, string> | Record<string, string>, sourceUrl: string): string {
  const uploaded = uploadedImages instanceof Map ? uploadedImages.get(sourceUrl) : uploadedImages[sourceUrl];
  if (!uploaded) {
    throw new Error(`图片尚未上传到微信小店：${sourceUrl}`);
  }
  return uploaded;
}

function parseMoneyToFen(text: string): number | undefined {
  const match = normalizeText(text).match(/(?:¥|￥)?\s*(\d+(?:[.．]\d{1,2})?)/u);
  if (!match?.[1]) return undefined;
  return Math.round(Number(match[1].replace('．', '.')) * 100);
}

function parseStockNum(text: string): number | undefined {
  const match = normalizeText(text).match(/\d+/u);
  if (!match?.[0]) return undefined;
  return Number(match[0]);
}

function sanitizeCode(value: string, fallback: string): string {
  const normalized = value
    .replace(/[^\dA-Za-z_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 128);
  return normalized || fallback;
}

function buildShortTitle(title: string): string {
  return truncateText(title, WX_SHORT_TITLE_MAX_LENGTH);
}

function buildAttrs(listing: ProductCopyRecord): WxShopAddProductAttr[] {
  const seen = new Set<string>();
  const attrs: WxShopAddProductAttr[] = [];
  for (const param of listing.params) {
    const key = normalizeText(param.name);
    const value = normalizeText(param.value);
    if (!key || !value) continue;
    const signature = `${key}\n${value}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    attrs.push({ attr_key: key, attr_value: value });
  }
  return attrs;
}

function buildOverrideAttrs(attrs?: WxProductDraftAttribute[]): WxShopAddProductAttr[] | undefined {
  if (!attrs) return undefined;
  const seen = new Set<string>();
  const normalized: WxShopAddProductAttr[] = [];
  for (const attr of attrs) {
    const key = normalizeText(attr.attrKey);
    const value = normalizeText(attr.attrValue);
    if (!key || !value) continue;
    const signature = `${key}\n${value}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    normalized.push({ attr_key: key, attr_value: value });
  }
  return normalized;
}

function normalizeCategoryIds(catIds: string[]): string[] {
  const normalized = catIds.map(id => id.trim()).filter(Boolean);
  if (normalized.length < WX_CATEGORY_MIN_DEPTH || normalized.length > WX_CATEGORY_MAX_DEPTH) {
    throw new Error('请输入完整的微信小店类目路径 ID');
  }
  return normalized;
}

function normalizeRequiredText(value: string | undefined, label: string): string {
  const normalized = value?.trim() || '';
  if (!normalized) throw new Error(`${label} 不能为空`);
  return normalized;
}

function normalizeRequiredNumericId(value: string | undefined, label: string): number {
  const normalized = normalizeRequiredText(value, label);
  if (!/^\d+$/u.test(normalized)) throw new Error(`${label}必须是数字 ID`);
  const numericId = Number(normalized);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) throw new Error(`${label}不是有效数字 ID`);
  return numericId;
}

function normalizeNonNegativeInteger(value: number | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label}必须是大于等于 0 的整数`);
  }
  return value;
}

function normalizeSkuSettings(defaultStockNum?: number, settings?: ProductCopySkuSettings): Required<Pick<ProductCopySkuSettings, 'defaultStockNum'>>
  & Partial<Pick<ProductCopySkuSettings, 'unifiedStockNum' | 'zeroStockReplacement' | 'minSkuPriceFen'>> {
  const resolvedDefaultStock = settings?.defaultStockNum ?? defaultStockNum ?? DEFAULT_WX_STOCK_NUM;
  if (!Number.isInteger(resolvedDefaultStock) || resolvedDefaultStock < 0) {
    throw new Error('默认库存必须是大于等于 0 的整数');
  }
  return {
    defaultStockNum: resolvedDefaultStock,
    unifiedStockNum: normalizeNonNegativeInteger(settings?.unifiedStockNum, '统一库存'),
    zeroStockReplacement: normalizeNonNegativeInteger(settings?.zeroStockReplacement, '0 库存替换值'),
    minSkuPriceFen: normalizeNonNegativeInteger(settings?.minSkuPriceFen, '最低 SKU 价格'),
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
  const adjusted = priceFen * normalized.multiplier + normalized.addAmountFen;
  const rounded = roundPriceFen(adjusted, normalized.rounding);
  if (!Number.isFinite(rounded) || rounded <= 0) {
    throw new Error('复制后 SKU 价格必须大于 0');
  }
  return rounded;
}

function buildTitle(listing: ProductCopyRecord, content?: ProductCopyContentSettings): string {
  const sourceTitle = listing.title || listing.identity.itemId;
  const title = normalizeWxText(`${content?.titlePrefix || ''}${sourceTitle}${content?.titleSuffix || ''}`);
  return truncateText(title, WX_TITLE_MAX_LENGTH);
}

function resolveMainImagesWithSettings(
  listing: ProductCopyRecord,
  uploadedImages: ProductCopyWxDraftMappingOptions['uploadedImages'],
  content?: ProductCopyContentSettings,
): { sourceImages: string[]; uploadedImages: string[] } {
  const sourceImages = resolveMainSourceImages(listing, content);
  if (sourceImages.length < WX_HEAD_IMAGE_MIN_COUNT) {
    throw new Error('微信小店商品主图至少需要 3 张');
  }
  return {
    sourceImages,
    uploadedImages: sourceImages.map(url => lookupUploadedImage(uploadedImages, url)),
  };
}

function resolveDetailImagesWithSettings(
  listing: ProductCopyRecord,
  mainSourceImages: string[],
  uploadedImages: ProductCopyWxDraftMappingOptions['uploadedImages'],
  content?: ProductCopyContentSettings,
): string[] {
  return resolveDetailSourceImages(listing, mainSourceImages, content)
    .map(url => lookupUploadedImage(uploadedImages, url));
}

function skuPriceInFen(sku: TaobaoProductSkuMatrixItem, listing: ProductCopyRecord): number {
  const price = sku.priceMoney ?? parseMoneyToFen(sku.priceText) ?? parseMoneyToFen(listing.price.rangeText);
  if (!price || price <= 0) {
    throw new Error(`SKU「${sku.id}」缺少有效价格`);
  }
  return price;
}

function skuStockNum(sku: TaobaoProductSkuMatrixItem, defaultStockNum: number): number {
  if (typeof sku.quantity === 'number' && Number.isFinite(sku.quantity) && sku.quantity >= 0) return Math.floor(sku.quantity);
  return parseStockNum(sku.stockText) ?? defaultStockNum;
}

function resolvedSkuStockNum(sku: TaobaoProductSkuMatrixItem, skuSettings: ReturnType<typeof normalizeSkuSettings>): number {
  if (skuSettings.unifiedStockNum !== undefined) return skuSettings.unifiedStockNum;
  const stockNum = skuStockNum(sku, skuSettings.defaultStockNum);
  if (stockNum === 0 && skuSettings.zeroStockReplacement !== undefined) return skuSettings.zeroStockReplacement;
  return stockNum;
}

function skuAttrs(sku: TaobaoProductSkuMatrixItem): WxShopAddProductAttr[] {
  return sku.specs
    .map(spec => ({
      attr_key: normalizeWxText(spec.name),
      attr_value: normalizeWxText(spec.value),
    }))
    .filter(attr => attr.attr_key && attr.attr_value);
}

function buildSku(
  listing: ProductCopyRecord,
  resolvedSku: ResolvedSkuInput,
  index: number,
  uploadedImages: ProductCopyWxDraftMappingOptions['uploadedImages'],
  fallbackThumbImg: string,
): WxShopAddProductSku {
  const sku = resolvedSku.sku;
  const skuCode = sanitizeCode(sku.skuId || sku.id, `${listing.identity.platform}-${listing.identity.itemId}-${index + 1}`);
  return {
    thumb_img: sku.imageUrl ? lookupUploadedImage(uploadedImages, sku.imageUrl) : fallbackThumbImg,
    sale_price: resolvedSku.salePrice,
    stock_num: resolvedSku.stockNum,
    sku_code: skuCode,
    sku_attrs: skuAttrs(sku),
    sku_deliver_info: { stock_type: 0 },
  };
}

function buildDefaultSku(
  listing: ProductCopyRecord,
  skuSettings: ReturnType<typeof normalizeSkuSettings>,
  pricing: ProductCopyPricingSettings | undefined,
  fallbackThumbImg: string,
): WxShopAddProductSku {
  const price = parseMoneyToFen(listing.price.rangeText);
  if (!price || price <= 0) {
    throw new Error('采集商品缺少有效价格，无法创建微信小店默认 SKU');
  }
  const salePrice = adjustedPriceInFen(price, pricing);
  if (skuSettings.minSkuPriceFen !== undefined && salePrice < skuSettings.minSkuPriceFen) {
    throw new Error('SKU 过滤后没有可复制规格，请调整最低 SKU 价格');
  }
  return {
    thumb_img: fallbackThumbImg,
    sale_price: salePrice,
    stock_num: skuSettings.unifiedStockNum ?? skuSettings.defaultStockNum,
    sku_code: sanitizeCode(`${listing.identity.platform}-${listing.identity.itemId}-default`, `${listing.identity.itemId}-default`),
    sku_attrs: [],
    sku_deliver_info: { stock_type: 0 },
  };
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

function buildSkus(
  listing: ProductCopyRecord,
  skuSettings: ReturnType<typeof normalizeSkuSettings>,
  pricing: ProductCopyPricingSettings | undefined,
  uploadedImages: ProductCopyWxDraftMappingOptions['uploadedImages'],
  fallbackThumbImg: string,
): WxShopAddProductSku[] {
  const resolvedSkus = resolveSkuInputs(listing, skuSettings, pricing);
  if (listing.sku.matrix.length === 0) return [buildDefaultSku(listing, skuSettings, pricing, fallbackThumbImg)];
  if (resolvedSkus.length === 0) throw new Error('SKU 过滤后没有可复制规格，请调整最低 SKU 价格');
  return resolvedSkus.map((sku, index) => buildSku(listing, sku, index, uploadedImages, fallbackThumbImg));
}

export function collectWxDraftSourceImages(
  listing: ProductCopyRecord,
  options: ProductCopyWxDraftSourceImageOptions = {},
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

export function mapProductCopyRecordToWxAddProductRequest(
  listing: ProductCopyRecord,
  options: ProductCopyWxDraftMappingOptions,
): WxShopAddProductRequest {
  const title = buildTitle(listing, options.content);
  if (Array.from(title).length < 5) {
    throw new Error('微信小店商品标题至少需要 5 个有效字符');
  }

  const catIds = normalizeCategoryIds(options.catIds);
  const expressTemplateId = normalizeRequiredText(options.expressTemplateId, '运费模板 ID');
  const afterSaleAddressId = normalizeRequiredNumericId(options.afterSaleAddressId, '售后地址 ID');
  const skuSettings = normalizeSkuSettings(options.defaultStockNum, options.sku);
  const { sourceImages: mainSourceImages, uploadedImages: headImgs } = resolveMainImagesWithSettings(
    listing,
    options.uploadedImages,
    options.content,
  );
  const detailImgs = resolveDetailImagesWithSettings(listing, mainSourceImages, options.uploadedImages, options.content);
  const resolvedDetailImgs = detailImgs.length > 0 ? detailImgs : [headImgs[0]];
  const attrs = buildOverrideAttrs(options.attrs) ?? buildAttrs(listing);
  const request: WxShopAddProductRequest = {
    out_product_id: sanitizeCode(`wishop-${listing.identity.platform}-${listing.identity.itemId}`, listing.identity.itemId),
    title,
    short_title: buildShortTitle(title),
    head_imgs: headImgs,
    deliver_method: 0,
    deliver_acct_type: [],
    desc_info: {
      imgs: resolvedDetailImgs,
      desc: title,
    },
    cats: [],
    cats_v2: catIds.map(cat_id => ({ cat_id })),
    attrs: attrs.length > 0 ? attrs : undefined,
    brand_id: options.brandId?.trim() || DEFAULT_BRAND_ID,
    // 微信小店部分类目强制要求七天无理由退货。这里默认开启七天无理由，
    // 运费险保持关闭，避免把非必需付费服务隐式打开。
    extra_service: { is_open_cod: 0, seven_day_return: 1, freight_insurance: 0 },
    skus: buildSkus(listing, skuSettings, options.pricing, options.uploadedImages, headImgs[0]),
    // 复制商品只创建微信小店草稿箱商品。提审和正式上架由商品提审模块接管，
    // 因此这里从请求体转换层开始就固定 listing=0，避免业务层误传 listing=1。
    listing: 0,
    express_info: { template_id: expressTemplateId },
    after_sale_info: { after_sale_address_id: afterSaleAddressId },
  };

  return request;
}
