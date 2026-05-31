import type { DraftProduct, ProductQrcodeResult, QuotaResult } from '../../../shared/types';

export type { DraftProduct, ProductQrcodeResult, QuotaResult };

export interface ProductListResult {
  productIds: string[];
  nextKey: string;
  hasMore: boolean;
}

export interface ListingResult {
  errcode: number;
  errmsg: string;
}

export interface WxShopListingClient {
  getDraftProducts(pageSize?: number, nextKey?: string): Promise<ProductListResult>;
  getProductDetail(productId: string): Promise<DraftProduct>;
  getProductQrcode(productId: string): Promise<ProductQrcodeResult>;
  listProduct(productId: string): Promise<ListingResult>;
  getAuditQuota(): Promise<QuotaResult>;
  deleteProduct(productId: string): Promise<ListingResult>;
}
