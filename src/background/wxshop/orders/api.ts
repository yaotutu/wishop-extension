import type { Order, OrderAddressInfo, OrderListParams, OrderListResult, OrderSearchParams, WxAfterSaleOrder } from '../../../shared/types';
import { normalizeOrderListPageSize, normalizeOrderListTimeRange } from '../../../shared/order-time-range.ts';
import { createWxShopRequestClient } from '../core/request';
import type { DeliveryCompany, SendOrderDeliveryPayload, WxShopOrdersClient } from './types';

function normalizeOrder(order: Order): Order {
  return {
    ...order,
    order_id: String(order.order_id || '').trim(),
  };
}

function normalizeOrderIds(orderIds: Array<string | number> = []): string[] {
  return orderIds.map(orderId => String(orderId).trim()).filter(Boolean);
}

export function createWxShopOrdersClient(accountId: string): WxShopOrdersClient {
  const wxshop = createWxShopRequestClient({
    accountId,
    domain: 'orders',
    component: 'WxShopOrdersClient',
  });

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
      wxshop.logger.error('订单列表 create_time_range 无效', params.create_time_range);
    }
    if (params.update_time_range && !updateTimeRange) {
      wxshop.logger.error('订单列表 update_time_range 无效', params.update_time_range);
    }
    if (createTimeRange) body.create_time_range = createTimeRange;
    if (updateTimeRange) body.update_time_range = updateTimeRange;
    if (params.order_id) body.order_id = params.order_id;
    if (!createTimeRange && !updateTimeRange) {
      wxshop.logger.error('订单列表请求缺少有效时间范围，已拦截', {
        page_size: body.page_size,
        status: body.status,
        hasNextKey: Boolean(body.next_key),
        order_id: body.order_id ? '[present]' : '',
        rawCreateTimeRange: params.create_time_range,
        rawUpdateTimeRange: params.update_time_range,
      });
      throw new Error('订单列表请求缺少有效时间范围，已在本地拦截，未发送到微信接口');
    }
    wxshop.logger.info('订单列表请求', {
      page_size: body.page_size,
      status: body.status ?? 'all',
      hasNextKey: Boolean(body.next_key),
      create_time_range: body.create_time_range,
      update_time_range: body.update_time_range,
    });

    const data = await wxshop.request<any>(path, body, stage);
    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }
    return {
      order_id_list: normalizeOrderIds(data.order_id_list),
      next_key: data.next_key || '',
      has_more: Boolean(data.has_more),
    };
  }

  async function getOrderDetail(orderId: string): Promise<Order> {
    const path = '/channels/ec/order/get';
    const stage = '获取订单详情';
    const data = await wxshop.request<any>(path, { order_id: orderId }, stage);
    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }
    return normalizeOrder(data.order);
  }

  async function getAfterSaleOrder(afterSaleOrderId: string): Promise<WxAfterSaleOrder> {
    const path = '/channels/ec/aftersale/getaftersaleorder';
    const stage = '获取售后详情';
    const data = await wxshop.request<any>(path, {
      after_sale_order_id: afterSaleOrderId,
    }, stage);
    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
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

    const data = await wxshop.request<any>(path, body, stage);
    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }
    return {
      order_id_list: normalizeOrderIds(data.order_id_list),
      next_key: data.next_key || '',
      has_more: Boolean(data.has_more),
    };
  }

  async function decodeOrderSensitiveInfo(orderId: string): Promise<OrderAddressInfo> {
    const path = '/channels/ec/order/sensitiveinfo/decode';
    const stage = '解密订单收货信息';
    const data = await wxshop.request<any>(path, { order_id: orderId }, stage);
    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }
    return {
      ...data.address_info,
      virtual_number_info: data.virtual_number_info,
    };
  }

  async function getDeliveryCompanyList(ewaybillOnly = false): Promise<DeliveryCompany[]> {
    const path = '/channels/ec/order/deliverycompanylist/new/get';
    const stage = '获取快递公司列表';
    const data = await wxshop.request<any>(path, { ewaybill_only: ewaybillOnly }, stage);
    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }
    return data.company_list || [];
  }

  async function sendOrderDelivery(payload: SendOrderDeliveryPayload): Promise<void> {
    const path = '/channels/ec/order/delivery/send';
    const stage = '提交订单发货';
    const data = await wxshop.request<any>(path, payload, stage);
    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }
  }

  return {
    getOrderList,
    getOrderDetail,
    getAfterSaleOrder,
    searchOrders,
    decodeOrderSensitiveInfo,
    getDeliveryCompanyList,
    sendOrderDelivery,
  };
}
