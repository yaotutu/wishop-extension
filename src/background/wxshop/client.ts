import axios from 'axios';
import type { Config, DraftProduct, QuotaResult, Order, OrderListParams, OrderListResult, OrderSearchParams, OrderAddressInfo } from '../../shared/types';

export type { Config, DraftProduct, QuotaResult };

const BASE_URL = 'https://api.weixin.qq.com';

interface TokenData {
  accessToken: string;
  expiresAt: number;
}

export interface ProductListResult {
  productIds: string[];
  nextKey: string;
  hasMore: boolean;
}

export interface ListingResult {
  errcode: number;
  errmsg: string;
}

export function createWxShopClient(config: Config) {
  let tokenCache: TokenData | null = null;

  async function getAccessToken(): Promise<string> {
    const now = Date.now();
    if (tokenCache && tokenCache.expiresAt > now + 60000) {
      return tokenCache.accessToken;
    }

    if (!config.appId || !config.appSecret) {
      throw new Error('[CREDENTIAL] 请先配置 AppID 和 AppSecret');
    }

    const url = `${BASE_URL}/cgi-bin/token?grant_type=client_credential&appid=${config.appId}&secret=${config.appSecret}`;
    const response = await axios.get(url);
    const data = response.data;

    if (data.errcode) {
      if (data.errcode === 40001 || data.errcode === 42001) {
        tokenCache = null;
        const msg = data.errcode === 40001
          ? 'AppSecret 不正确或已失效，请前往店铺管理更新配置'
          : 'access_token 已过期，请前往店铺管理更新配置';
        throw new Error(`[CREDENTIAL] ${msg}`);
      }
      throw new Error(data.errmsg || `获取 token 失败: ${data.errcode}`);
    }

    tokenCache = {
      accessToken: data.access_token,
      expiresAt: now + (data.expires_in - 120) * 1000,
    };

    return data.access_token;
  }

  async function getDraftProducts(pageSize = 30, nextKey = ''): Promise<ProductListResult> {
    const token = await getAccessToken();
    const url = `${BASE_URL}/channels/ec/product/list/get?access_token=${token}`;

    const response = await axios.post(url, {
      page_size: Math.min(pageSize, 30),
      next_key: nextKey || undefined,
      status: 0,
    });

    const data = response.data;

    if (data.errcode && data.errcode !== 0) {
      throw new Error(data.errmsg || `获取草稿列表失败: ${data.errcode}`);
    }

    const productIds = data.product_ids || [];

    return {
      productIds,
      nextKey: data.next_key || '',
      hasMore: !!data.next_key,
    };
  }

  async function getProductDetail(productId: string): Promise<DraftProduct> {
    const token = await getAccessToken();
    const url = `${BASE_URL}/channels/ec/product/get?access_token=${token}`;

    const response = await axios.post(url, {
      product_id: productId,
      data_type: 2,
    });

    const data = response.data;

    if (data.errcode && data.errcode !== 0) {
      throw new Error(data.errmsg || `获取商品详情失败: ${data.errcode}`);
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
    const token = await getAccessToken();
    const url = `${BASE_URL}/channels/ec/product/listing?access_token=${token}`;
    const response = await axios.post(url, { product_id: productId });
    return response.data;
  }

  async function getAuditQuota(): Promise<QuotaResult> {
    const token = await getAccessToken();
    const url = `${BASE_URL}/channels/ec/product/getauditquota?access_token=${token}`;
    const response = await axios.post(url, {});
    const data = response.data;

    if (data.errcode && data.errcode !== 0) {
      throw new Error(data.errmsg || `获取配额失败: ${data.errcode}`);
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
    const token = await getAccessToken();
    const url = `${BASE_URL}/channels/ec/product/delete?access_token=${token}`;
    const response = await axios.post(url, { product_id: productId });
    return response.data;
  }

  async function getOrderList(params: OrderListParams = {}): Promise<OrderListResult> {
    const token = await getAccessToken();
    const url = `${BASE_URL}/channels/ec/order/list/get?access_token=${token}`;
    const body: Record<string, unknown> = {
      page_size: params.page_size || 10,
    };
    if (params.next_key) body.next_key = params.next_key;
    if (params.status !== undefined) body.status = params.status;
    if (params.create_time_range) body.create_time_range = params.create_time_range;
    if (params.update_time_range) body.update_time_range = params.update_time_range;
    if (params.order_id) body.order_id = params.order_id;

    const response = await axios.post(url, body);
    const data = response.data;
    if (data.errcode && data.errcode !== 0) {
      throw new Error(data.errmsg || `获取订单列表失败: ${data.errcode}`);
    }
    return {
      order_id_list: data.order_id_list || [],
      next_key: data.next_key || '',
      has_more: !!data.has_more,
    };
  }

  async function getOrderDetail(orderId: string): Promise<Order> {
    const token = await getAccessToken();
    const url = `${BASE_URL}/channels/ec/order/get?access_token=${token}`;
    const response = await axios.post(url, { order_id: orderId });
    const data = response.data;
    if (data.errcode && data.errcode !== 0) {
      throw new Error(data.errmsg || `获取订单详情失败: ${data.errcode}`);
    }
    return data.order;
  }

  async function searchOrders(params: OrderSearchParams): Promise<OrderListResult> {
    const token = await getAccessToken();
    const url = `${BASE_URL}/channels/ec/order/search?access_token=${token}`;
    const searchCondition: Record<string, string> = {};
    const fieldMap: Record<string, string> = {
      order_id: 'order_id',
      title: 'title',
      user_name: 'user_name',
      tel_number_last4: 'tel_number_last4',
      merchant_notes: 'merchant_notes',
      customer_notes: 'customer_notes',
    };
    const key = fieldMap[params.search_type];
    if (key && params.keyword) {
      searchCondition[key] = params.keyword;
    }

    const body: Record<string, unknown> = {
      search_condition: searchCondition,
      page_size: params.page_size || 10,
      next_key: params.next_key || '',
    };
    if (params.status !== undefined) body.status = params.status;

    const response = await axios.post(url, body);
    const data = response.data;
    if (data.errcode && data.errcode !== 0) {
      throw new Error(data.errmsg || `搜索订单失败: ${data.errcode}`);
    }
    return {
      order_id_list: data.order_id_list || [],
      next_key: data.next_key || '',
      has_more: !!data.has_more,
    };
  }

  async function decodeOrderSensitiveInfo(orderId: string): Promise<OrderAddressInfo> {
    const token = await getAccessToken();
    const url = `${BASE_URL}/channels/ec/order/sensitiveinfo/decode?access_token=${token}`;
    const response = await axios.post(url, { order_id: orderId });
    const data = response.data;
    if (data.errcode && data.errcode !== 0) {
      throw new Error(data.errmsg || `解密收货信息失败: ${data.errcode}`);
    }
    return data.address_info;
  }

  function clearTokenCache(): void {
    tokenCache = null;
  }

  return {
    config,
    getAccessToken,
    getDraftProducts,
    getProductDetail,
    listProduct,
    getAuditQuota,
    deleteProduct,
    getOrderList,
    getOrderDetail,
    searchOrders,
    decodeOrderSensitiveInfo,
    clearTokenCache,
  };
}

export type WxShopClient = ReturnType<typeof createWxShopClient>;
