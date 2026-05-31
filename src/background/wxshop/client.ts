import axios from 'axios';
import type { DraftProduct, QuotaResult, Order, OrderListParams, OrderListResult, OrderSearchParams, OrderAddressInfo, WxAfterSaleOrder } from '../../shared/types';
import { normalizeOrderListPageSize, normalizeOrderListTimeRange } from '../../shared/order-time-range.ts';
import { createExternalApiError, normalizeExternalRequestError } from '../errors/external-error.ts';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';
import { getAccessToken, isAccessTokenInvalidError, removeAccessToken } from './access-token-service';

export type { DraftProduct, QuotaResult };

const BASE_URL = 'https://api.weixin.qq.com';

export interface ProductListResult {
  productIds: string[];
  nextKey: string;
  hasMore: boolean;
}

export interface ListingResult {
  errcode: number;
  errmsg: string;
}

export interface DeliveryCompany {
  delivery_id: string;
  delivery_name: string;
}

export interface SendOrderDeliveryPayload {
  order_id: string;
  delivery_list: Array<{
    delivery_id: string;
    waybill_id: string;
    deliver_type: 1;
    product_infos: Array<{
      product_cnt: number;
      product_id: string;
      sku_id: string;
    }>;
  }>;
}

function normalizeOrder(order: Order): Order {
  return {
    ...order,
    order_id: String(order.order_id || '').trim(),
  };
}

function normalizeOrderIds(orderIds: Array<string | number> = []): string[] {
  return orderIds.map(orderId => String(orderId).trim()).filter(Boolean);
}

export function createWxShopClient(accountId: string) {
  const logger = createDiagnosticLogger({ domain: 'orders', component: 'WxShopClient', accountId });

  function throwWxApiError(path: string, stage: string, data: { errcode?: number; errmsg?: string }): never {
    throw createExternalApiError({
      service: '微信小店',
      method: 'POST',
      path,
      stage,
    }, Number(data.errcode), data.errmsg || `${stage}失败`);
  }

  async function request<T>(path: string, body: unknown, stage: string): Promise<T> {
    const send = async (forceRefresh = false) => {
      const token = await getAccessToken(accountId, forceRefresh);
      const url = `${BASE_URL}${path}?access_token=${token}`;
      let response;
      try {
        response = await axios.post(url, body);
      } catch (error) {
        throw normalizeExternalRequestError(error, {
          service: '微信小店',
          method: 'POST',
          path,
          stage,
        });
      }
      return response.data as T & { errcode?: number };
    };

    const data = await send(false);
    if (!isAccessTokenInvalidError(data.errcode)) return data;

    await removeAccessToken(accountId);
    return send(true);
  }

  async function getDraftProducts(pageSize = 30, nextKey = ''): Promise<ProductListResult> {
    const path = '/channels/ec/product/list/get';
    const stage = '获取草稿商品列表';
    const data = await request<any>(path, {
      page_size: Math.min(pageSize, 30),
      next_key: nextKey || undefined,
      status: 0,
    }, stage);

    if (data.errcode && data.errcode !== 0) {
      throwWxApiError(path, stage, data);
    }

    const productIds = data.product_ids || [];

    return {
      productIds,
      nextKey: data.next_key || '',
      hasMore: !!data.next_key,
    };
  }

  async function getProductDetail(productId: string): Promise<DraftProduct> {
    const path = '/channels/ec/product/get';
    const stage = '获取商品详情';
    const data = await request<any>(path, {
      product_id: productId,
      data_type: 2,
    }, stage);

    if (data.errcode && data.errcode !== 0) {
      throwWxApiError(path, stage, data);
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
    return request<ListingResult>('/channels/ec/product/listing', { product_id: productId }, '提交商品提审');
  }

  async function getAuditQuota(): Promise<QuotaResult> {
    const path = '/channels/ec/product/getauditquota';
    const stage = '获取商品提审配额';
    const data = await request<any>(path, {}, stage);

    if (data.errcode && data.errcode !== 0) {
      throwWxApiError(path, stage, data);
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
    return request<ListingResult>('/channels/ec/product/delete', { product_id: productId }, '删除商品草稿');
  }

  async function getOrderList(params: OrderListParams = {}): Promise<OrderListResult> {
    const path = '/channels/ec/order/list/get';
    const stage = '获取订单列表';
    const createTimeRange = normalizeOrderListTimeRange(params.create_time_range);
    const updateTimeRange = normalizeOrderListTimeRange(params.update_time_range);
    const body: Record<string, unknown> = {
      page_size: normalizeOrderListPageSize(params.page_size),
      next_key: params.next_key || '',
    };
    if (params.status !== undefined) body.status = params.status;
    if (params.create_time_range && !createTimeRange) {
      logger.error('订单列表 create_time_range 无效', params.create_time_range);
    }
    if (params.update_time_range && !updateTimeRange) {
      logger.error('订单列表 update_time_range 无效', params.update_time_range);
    }
    if (createTimeRange) body.create_time_range = createTimeRange;
    if (updateTimeRange) body.update_time_range = updateTimeRange;
    if (params.order_id) body.order_id = params.order_id;
    if (!createTimeRange && !updateTimeRange) {
      logger.error('订单列表请求缺少有效时间范围，已拦截', {
        page_size: body.page_size,
        status: body.status,
        hasNextKey: Boolean(body.next_key),
        order_id: body.order_id ? '[present]' : '',
        rawCreateTimeRange: params.create_time_range,
        rawUpdateTimeRange: params.update_time_range,
      });
      throw new Error('订单列表请求缺少有效时间范围，已在本地拦截，未发送到微信接口');
    }
    logger.info('订单列表请求', {
      page_size: body.page_size,
      status: body.status ?? 'all',
      hasNextKey: Boolean(body.next_key),
      create_time_range: body.create_time_range,
      update_time_range: body.update_time_range,
    });

    const data = await request<any>(path, body, stage);
    if (data.errcode && data.errcode !== 0) {
      throwWxApiError(path, stage, data);
    }
    return {
      order_id_list: normalizeOrderIds(data.order_id_list),
      next_key: data.next_key || '',
      has_more: !!data.has_more,
    };
  }

  async function getOrderDetail(orderId: string): Promise<Order> {
    const path = '/channels/ec/order/get';
    const stage = '获取订单详情';
    const data = await request<any>(path, { order_id: orderId }, stage);
    if (data.errcode && data.errcode !== 0) {
      throwWxApiError(path, stage, data);
    }
    return normalizeOrder(data.order);
  }

  async function getAfterSaleOrder(afterSaleOrderId: string): Promise<WxAfterSaleOrder> {
    const path = '/channels/ec/aftersale/getaftersaleorder';
    const stage = '获取售后详情';
    const data = await request<any>(path, {
      after_sale_order_id: afterSaleOrderId,
    }, stage);
    if (data.errcode && data.errcode !== 0) {
      throwWxApiError(path, stage, data);
    }
    if (!data.after_sale_order) {
      throw new Error(`售后单 ${afterSaleOrderId} 详情为空`);
    }
    return data.after_sale_order;
  }

  async function searchOrders(params: OrderSearchParams): Promise<OrderListResult> {
    const path = '/channels/ec/order/search';
    const stage = '搜索订单';
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

    const data = await request<any>(path, body, stage);
    if (data.errcode && data.errcode !== 0) {
      throwWxApiError(path, stage, data);
    }
    return {
      order_id_list: normalizeOrderIds(data.order_id_list),
      next_key: data.next_key || '',
      has_more: !!data.has_more,
    };
  }

  async function decodeOrderSensitiveInfo(orderId: string): Promise<OrderAddressInfo> {
    const path = '/channels/ec/order/sensitiveinfo/decode';
    const stage = '解密订单收货信息';
    const data = await request<any>(path, { order_id: orderId }, stage);
    if (data.errcode && data.errcode !== 0) {
      throwWxApiError(path, stage, data);
    }
    return {
      ...data.address_info,
      virtual_number_info: data.virtual_number_info,
    };
  }

  async function getDeliveryCompanyList(ewaybillOnly = false): Promise<DeliveryCompany[]> {
    const path = '/channels/ec/order/deliverycompanylist/new/get';
    const stage = '获取快递公司列表';
    const data = await request<any>(path, { ewaybill_only: ewaybillOnly }, stage);
    if (data.errcode && data.errcode !== 0) {
      throwWxApiError(path, stage, data);
    }
    return data.company_list || [];
  }

  async function sendOrderDelivery(payload: SendOrderDeliveryPayload): Promise<void> {
    const path = '/channels/ec/order/delivery/send';
    const stage = '提交订单发货';
    const data = await request<any>(path, payload, stage);
    if (data.errcode && data.errcode !== 0) {
      throwWxApiError(path, stage, data);
    }
  }

  return {
    getDraftProducts,
    getProductDetail,
    listProduct,
    getAuditQuota,
    deleteProduct,
    getOrderList,
    getOrderDetail,
    getAfterSaleOrder,
    searchOrders,
    decodeOrderSensitiveInfo,
    getDeliveryCompanyList,
    sendOrderDelivery,
  };
}

export type WxShopClient = ReturnType<typeof createWxShopClient>;
