import type {
  CollectedProductListing,
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

export interface ProductListingWxDraftMappingOptions {
  catIds: string[];
  expressTemplateId?: string;
  afterSaleAddressId?: string;
  brandId?: string;
  defaultStockNum?: number;
  attrs?: WxProductDraftAttribute[];
  uploadedImages: Map<string, string> | Record<string, string>;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
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

function buildAttrs(listing: CollectedProductListing): WxShopAddProductAttr[] {
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

function normalizeDefaultStock(defaultStockNum?: number): number {
  if (defaultStockNum === undefined) return DEFAULT_WX_STOCK_NUM;
  if (!Number.isInteger(defaultStockNum) || defaultStockNum < 0) {
    throw new Error('默认库存必须是大于等于 0 的整数');
  }
  return defaultStockNum;
}

function resolveMainImages(listing: CollectedProductListing, uploadedImages: ProductListingWxDraftMappingOptions['uploadedImages']): string[] {
  const sourceImages = uniqueStrings(listing.images.main).slice(0, WX_HEAD_IMAGE_MAX_COUNT);
  if (sourceImages.length < WX_HEAD_IMAGE_MIN_COUNT) {
    throw new Error('微信小店商品主图至少需要 3 张');
  }
  return sourceImages.map(url => lookupUploadedImage(uploadedImages, url));
}

function resolveDetailImages(listing: CollectedProductListing, uploadedImages: ProductListingWxDraftMappingOptions['uploadedImages']): string[] {
  const mainImageSet = new Set(uniqueStrings(listing.images.main).slice(0, WX_HEAD_IMAGE_MAX_COUNT));
  return uniqueStrings(listing.images.detail)
    .filter(url => !mainImageSet.has(url))
    .slice(0, WX_DETAIL_IMAGE_MAX_COUNT)
    .map(url => lookupUploadedImage(uploadedImages, url));
}

function skuPriceInFen(sku: TaobaoProductSkuMatrixItem, listing: CollectedProductListing): number {
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

function skuAttrs(sku: TaobaoProductSkuMatrixItem): WxShopAddProductAttr[] {
  return sku.specs
    .map(spec => ({
      attr_key: normalizeText(spec.name),
      attr_value: normalizeText(spec.value),
    }))
    .filter(attr => attr.attr_key && attr.attr_value);
}

function buildSku(
  listing: CollectedProductListing,
  sku: TaobaoProductSkuMatrixItem,
  index: number,
  defaultStockNum: number,
  uploadedImages: ProductListingWxDraftMappingOptions['uploadedImages'],
  fallbackThumbImg: string,
): WxShopAddProductSku {
  const skuCode = sanitizeCode(sku.skuId || sku.id, `${listing.identity.platform}-${listing.identity.itemId}-${index + 1}`);
  return {
    thumb_img: sku.imageUrl ? lookupUploadedImage(uploadedImages, sku.imageUrl) : fallbackThumbImg,
    sale_price: skuPriceInFen(sku, listing),
    stock_num: skuStockNum(sku, defaultStockNum),
    sku_code: skuCode,
    sku_attrs: skuAttrs(sku),
    sku_deliver_info: { stock_type: 0 },
  };
}

function buildDefaultSku(
  listing: CollectedProductListing,
  defaultStockNum: number,
  fallbackThumbImg: string,
): WxShopAddProductSku {
  const price = parseMoneyToFen(listing.price.rangeText);
  if (!price || price <= 0) {
    throw new Error('采集商品缺少有效价格，无法创建微信小店默认 SKU');
  }
  return {
    thumb_img: fallbackThumbImg,
    sale_price: price,
    stock_num: defaultStockNum,
    sku_code: sanitizeCode(`${listing.identity.platform}-${listing.identity.itemId}-default`, `${listing.identity.itemId}-default`),
    sku_attrs: [],
    sku_deliver_info: { stock_type: 0 },
  };
}

function buildSkus(
  listing: CollectedProductListing,
  defaultStockNum: number,
  uploadedImages: ProductListingWxDraftMappingOptions['uploadedImages'],
  fallbackThumbImg: string,
): WxShopAddProductSku[] {
  const matrix = listing.sku.matrix.slice(0, WX_SKU_MAX_COUNT);
  if (matrix.length === 0) return [buildDefaultSku(listing, defaultStockNum, fallbackThumbImg)];
  return matrix.map((sku, index) => buildSku(listing, sku, index, defaultStockNum, uploadedImages, fallbackThumbImg));
}

export function collectWxDraftSourceImages(listing: CollectedProductListing): string[] {
  return uniqueStrings([
    ...listing.images.main.slice(0, WX_HEAD_IMAGE_MAX_COUNT),
    ...listing.images.detail.slice(0, WX_DETAIL_IMAGE_MAX_COUNT),
    ...listing.sku.matrix.map(sku => sku.imageUrl).filter(Boolean),
  ]);
}

export function mapCollectedListingToWxAddProductRequest(
  listing: CollectedProductListing,
  options: ProductListingWxDraftMappingOptions,
): WxShopAddProductRequest {
  const title = truncateText(listing.title || listing.identity.itemId, WX_TITLE_MAX_LENGTH);
  if (Array.from(title).length < 5) {
    throw new Error('微信小店商品标题至少需要 5 个有效字符');
  }

  const catIds = normalizeCategoryIds(options.catIds);
  const expressTemplateId = normalizeRequiredText(options.expressTemplateId, '运费模板 ID');
  const afterSaleAddressId = normalizeRequiredNumericId(options.afterSaleAddressId, '售后地址 ID');
  const defaultStockNum = normalizeDefaultStock(options.defaultStockNum);
  const headImgs = resolveMainImages(listing, options.uploadedImages);
  const detailImgs = resolveDetailImages(listing, options.uploadedImages);
  const attrs = buildOverrideAttrs(options.attrs) ?? buildAttrs(listing);
  const request: WxShopAddProductRequest = {
    out_product_id: sanitizeCode(`wishop-${listing.identity.platform}-${listing.identity.itemId}`, listing.identity.itemId),
    title,
    short_title: buildShortTitle(title),
    head_imgs: headImgs,
    deliver_method: 0,
    deliver_acct_type: [],
    desc_info: {
      imgs: detailImgs,
      desc: title,
    },
    cats: [],
    cats_v2: catIds.map(cat_id => ({ cat_id })),
    attrs: attrs.length > 0 ? attrs : undefined,
    brand_id: options.brandId?.trim() || DEFAULT_BRAND_ID,
    // 微信小店部分类目强制要求七天无理由退货。这里默认开启七天无理由，
    // 运费险保持关闭，避免把非必需付费服务隐式打开。
    extra_service: { is_open_cod: 0, seven_day_return: 1, freight_insurance: 0 },
    skus: buildSkus(listing, defaultStockNum, options.uploadedImages, headImgs[0]),
    // 上货管理只创建微信小店草稿箱商品。提审和正式上架由商品提审模块接管，
    // 因此这里从请求体转换层开始就固定 listing=0，避免业务层误传 listing=1。
    listing: 0,
    express_info: { template_id: expressTemplateId },
    after_sale_info: { after_sale_address_id: afterSaleAddressId },
  };

  if (detailImgs.length === 0) {
    request.desc_info = { desc: title };
  }
  return request;
}
