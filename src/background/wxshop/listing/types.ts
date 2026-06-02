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

export interface WxShopListingClient {
  getDraftProducts(pageSize?: number, nextKey?: string): Promise<ProductListResult>;
  getProductDetail(productId: string): Promise<DraftProduct>;
  getProductQrcode(productId: string): Promise<ProductQrcodeResult>;
  getAllCategoryPaths(): Promise<WxProductCategoryPath[]>;
  uploadImageByUrl(imgUrl: string): Promise<WxShopProductImageUploadResult>;
  addProduct(input: WxShopAddProductRequest): Promise<WxShopAddProductResult>;
  submitProductAudit(productId: string): Promise<ListingResult>;
  getAuditQuota(): Promise<QuotaResult>;
  deleteProduct(productId: string): Promise<ListingResult>;
}
