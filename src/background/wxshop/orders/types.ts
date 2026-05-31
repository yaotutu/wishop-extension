import type { Order, OrderAddressInfo, OrderListParams, OrderListResult, OrderSearchParams, WxAfterSaleOrder } from '../../../shared/types';

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

export interface WxShopOrdersClient {
  getOrderList(params?: OrderListParams): Promise<OrderListResult>;
  getOrderDetail(orderId: string): Promise<Order>;
  getAfterSaleOrder(afterSaleOrderId: string): Promise<WxAfterSaleOrder>;
  searchOrders(params: OrderSearchParams): Promise<OrderListResult>;
  decodeOrderSensitiveInfo(orderId: string): Promise<OrderAddressInfo>;
  getDeliveryCompanyList(ewaybillOnly?: boolean): Promise<DeliveryCompany[]>;
  sendOrderDelivery(payload: SendOrderDeliveryPayload): Promise<void>;
}
