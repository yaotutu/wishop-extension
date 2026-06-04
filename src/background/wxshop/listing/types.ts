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

export interface WxShopListingClient {
  getDraftProducts(pageSize?: number, nextKey?: string): Promise<ProductListResult>;
  getProductDetail(productId: string): Promise<DraftProduct>;
  getProductQrcode(productId: string): Promise<ProductQrcodeResult>;
  getAllCategoryPaths(): Promise<WxProductCategoryPath[]>;
  precheckProductCategory(catId: string): Promise<WxShopCategoryPrecheckResult>;
  getCategoryProductRule(catId: string): Promise<WxShopCategoryProductRule>;
  getFreightTemplateIds(): Promise<string[]>;
  getMerchantAddressIds(): Promise<string[]>;
  getMerchantAddressDetail(addressId: string): Promise<WxShopMerchantAddressDetail>;
  uploadImageByUrl(imgUrl: string): Promise<WxShopProductImageUploadResult>;
  addProduct(input: WxShopAddProductRequest): Promise<WxShopAddProductResult>;
  submitProductAudit(productId: string): Promise<ListingResult>;
  getAuditQuota(): Promise<QuotaResult>;
  deleteProduct(productId: string): Promise<ListingResult>;
}
