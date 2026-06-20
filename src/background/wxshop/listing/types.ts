import type {
  DraftProduct,
  ProductQrcodeResult,
  QuotaResult,
  WxProductCategoryPath,
  WxProductDraftPreparedAttr,
  WxProductDraftPreparedRequest,
  WxProductDraftPreparedSku,
} from '../../../shared/types';

export type { DraftProduct, ProductQrcodeResult, QuotaResult, WxProductCategoryPath };

export interface ProductListResult {
  productIds: string[];
  nextKey: string;
  hasMore: boolean;
}

export interface ListingResult {
  errcode: number;
  errmsg: string;
}

export interface WxShopProductImageUploadResult {
  imgUrl: string;
}

export type WxShopAddProductAttr = WxProductDraftPreparedAttr;

export type WxShopAddProductSku = WxProductDraftPreparedSku;

export type WxShopAddProductRequest = WxProductDraftPreparedRequest;

export interface WxShopAddProductResult {
  productId: string;
  createTime?: string;
}

export interface WxShopMerchantAddressDetail {
  addressId: string;
  defaultSend: boolean;
  defaultRecv: boolean;
  sendAddr: boolean;
  recvAddr: boolean;
}

export interface WxShopFreightTemplateSummary {
  templateId: string;
  name?: string;
  valuationType?: number;
}

export interface WxShopCategoryPrecheckResult {
  catId: string;
  allPass: boolean;
  failReasons: string[];
}

export interface WxShopCategoryProductAttrRule {
  name: string;
  type: string;
  values: string[];
  required: boolean;
  appendAllowed: boolean;
  hint?: string;
}

export interface WxShopCategoryProductRule {
  catId: string;
  name?: string;
  productAttrs: WxShopCategoryProductAttrRule[];
  saleAttrs: WxShopCategoryProductAttrRule[];
}

/**
 * 带全量可扫描字段的商品详情。
 *
 * 供合规扫描等「需要更多文本字段」的场景使用。
 * 与 DraftProduct 的区别：后者是草稿通用载体（提审/删除/展示共用），
 * 只带最小字段；这里额外带商品描述、属性、SKU 属性聚合文本，
 * 避免污染通用类型，也让扫描字段提取器有料可抽。
 */
export interface DraftProductFull extends DraftProduct {
  /** 商品描述纯文本（来自 desc_info.desc）。可能为空。 */
  desc?: string;
  /** 商品属性聚合文本（attrs 拼成「键:值」文本）。可能为空。 */
  attrsText?: string;
  /** SKU 属性聚合文本（skus[].sku_attrs 拼成「键:值」文本）。可能为空。 */
  skuAttrsText?: string;
}

export interface WxShopListingClient {
  getDraftProducts(pageSize?: number, nextKey?: string): Promise<ProductListResult>;
  getProductDetail(productId: string): Promise<DraftProduct>;
  /**
   * 获取带全量可扫描字段的商品详情。
   * 相比 getProductDetail 多返回 desc / attrsText / skuAttrsText，
   * 供合规扫描使用。其它模块继续用精简的 getProductDetail。
   */
  getProductDetailFull(productId: string): Promise<DraftProductFull>;
  getProductQrcode(productId: string): Promise<ProductQrcodeResult>;
  getAllCategoryPaths(): Promise<WxProductCategoryPath[]>;
  precheckProductCategory(catId: string): Promise<WxShopCategoryPrecheckResult>;
  getCategoryProductRule(catId: string): Promise<WxShopCategoryProductRule>;
  getFreightTemplates(): Promise<WxShopFreightTemplateSummary[]>;
  getFreightTemplateIds(): Promise<string[]>;
  getMerchantAddressIds(): Promise<string[]>;
  getMerchantAddressDetail(addressId: string): Promise<WxShopMerchantAddressDetail>;
  uploadImageByUrl(imgUrl: string): Promise<WxShopProductImageUploadResult>;
  addProduct(input: WxShopAddProductRequest): Promise<WxShopAddProductResult>;
  submitProductAudit(productId: string): Promise<ListingResult>;
  getAuditQuota(): Promise<QuotaResult>;
  deleteProduct(productId: string): Promise<ListingResult>;
}
