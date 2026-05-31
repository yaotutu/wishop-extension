import type { DraftProduct, QuotaResult } from '../../../shared/types';
import { createWxShopRequestClient } from '../core/request';
import type { ListingResult, ProductListResult, WxShopListingClient } from './types';

export function createWxShopListingClient(accountId: string): WxShopListingClient {
  const wxshop = createWxShopRequestClient({
    accountId,
    domain: 'listing',
    component: 'WxShopListingClient',
  });

  async function getDraftProducts(pageSize = 30, nextKey = ''): Promise<ProductListResult> {
    const path = '/channels/ec/product/list/get';
    const stage = '获取草稿商品列表';
    const data = await wxshop.request<any>(path, {
      page_size: Math.min(pageSize, 30),
      next_key: nextKey || undefined,
      status: 0,
    }, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }

    return {
      productIds: data.product_ids || [],
      nextKey: data.next_key || '',
      hasMore: Boolean(data.next_key),
    };
  }

  async function getProductDetail(productId: string): Promise<DraftProduct> {
    const path = '/channels/ec/product/get';
    const stage = '获取商品详情';
    const data = await wxshop.request<any>(path, {
      product_id: productId,
      data_type: 2,
    }, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }

    const product = data.edit_product;
    if (!product) {
      throw new Error(`商品 ${productId} 详情为空`);
    }

    return {
      productId: product.product_id,
      title: product.title,
      headImgs: product.head_imgs || [],
      status: product.status,
      editStatus: product.edit_status,
    };
  }

  async function listProduct(productId: string): Promise<ListingResult> {
    return wxshop.request<ListingResult>('/channels/ec/product/listing', { product_id: productId }, '提交商品提审');
  }

  async function getAuditQuota(): Promise<QuotaResult> {
    const path = '/channels/ec/product/getauditquota';
    const stage = '获取商品提审配额';
    const data = await wxshop.request<any>(path, {}, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }

    if (!data.audit_quota) {
      return { quota: 0, total: 0 };
    }

    return {
      quota: data.audit_quota.avail_quota,
      total: data.audit_quota.total_quota,
    };
  }

  async function deleteProduct(productId: string): Promise<ListingResult> {
    return wxshop.request<ListingResult>('/channels/ec/product/delete', { product_id: productId }, '删除商品草稿');
  }

  return {
    getDraftProducts,
    getProductDetail,
    listProduct,
    getAuditQuota,
    deleteProduct,
  };
}
