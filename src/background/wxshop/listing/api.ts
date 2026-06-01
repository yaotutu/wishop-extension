import type { DraftProduct, QuotaResult, WxProductCategoryPath } from '../../../shared/types';
import { createWxShopRequestClient } from '../core/request';
import type {
  ListingResult,
  ProductListResult,
  WxShopAddProductRequest,
  WxShopAddProductResult,
  WxShopListingClient,
  WxShopProductImageUploadResult,
} from './types';
import { normalizeWxCategoryPaths } from './category-paths.ts';

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

  async function getProductQrcode(productId: string) {
    const path = '/channels/ec/product/qrcode/get';
    const stage = '获取商品二维码';
    // 官方接口要求在服务端调用，并且只支持上架销售中的小店自营商品。
    // 这里保持最小请求体，避免把企业微信归因参数误带到普通商家查看场景里。
    const data = await wxshop.request<any>(path, {
      product_id: productId,
      qrcode_type: 1,
    }, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }

    const qrcodeUrl = typeof data.product_qrcode === 'string' ? data.product_qrcode.trim() : '';
    if (!qrcodeUrl) {
      throw new Error(`商品 ${productId} 二维码链接为空`);
    }

    return {
      productId,
      qrcodeUrl,
    };
  }

  async function getAllCategoryPaths(): Promise<WxProductCategoryPath[]> {
    const path = '/shop/ec/category/all';
    const stage = '获取微信小店类目';
    const data = await wxshop.get<any>(path, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data, 'GET');
    }

    const paths = normalizeWxCategoryPaths(data.cats_v2 ?? data.cats ?? data.category_list ?? []);
    if (paths.length === 0) {
      throw new Error('微信小店类目接口未返回可用三级叶子类目');
    }
    return paths;
  }

  async function uploadImageByUrl(imgUrl: string): Promise<WxShopProductImageUploadResult> {
    const path = '/shop/ec/basics/img/upload?upload_type=1&resp_type=1';
    const stage = '上传商品图片';
    const data = await wxshop.request<any>(path, { img_url: imgUrl }, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }

    const uploadedUrl = typeof data.pic_file?.img_url === 'string' ? data.pic_file.img_url.trim() : '';
    if (!uploadedUrl) {
      throw new Error('微信小店图片上传接口未返回图片链接');
    }

    return { imgUrl: uploadedUrl };
  }

  async function addProduct(input: WxShopAddProductRequest): Promise<WxShopAddProductResult> {
    const path = '/channels/ec/product/add';
    const stage = '创建商品草稿';
    const data = await wxshop.request<any>(path, input, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }

    const productId = data.data?.product_id ?? data.product_id;
    if (productId === undefined || productId === null || String(productId).trim() === '') {
      throw new Error('微信小店新增商品接口未返回商品 ID');
    }

    return {
      productId: String(productId),
      createTime: typeof data.data?.create_time === 'string' ? data.data.create_time : undefined,
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
    getProductQrcode,
    getAllCategoryPaths,
    uploadImageByUrl,
    addProduct,
    listProduct,
    getAuditQuota,
    deleteProduct,
  };
}
