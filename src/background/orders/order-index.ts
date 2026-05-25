import type { Order, OrderSearchParams } from '../../shared/types';

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function buildOrderIndexedText(order: Order): string {
  const products = order.order_detail?.product_infos || [];
  const address = order.order_detail?.delivery_info?.address_info;
  const ext = order.order_detail?.ext_info;
  return [
    order.order_id,
    ...products.map(product => product.title),
    address?.user_name,
    address?.tel_number,
    address?.purchaser_tel_number,
    address?.virtual_order_tel_number,
    ext?.merchant_notes,
    ext?.customer_notes,
  ].map(normalizeText).filter(Boolean).join(' ');
}

export function orderMatchesSearch(order: Order, indexedText: string, params: OrderSearchParams): boolean {
  const keyword = normalizeText(params.keyword);
  if (!keyword) return true;
  const ext = order.order_detail?.ext_info;
  const address = order.order_detail?.delivery_info?.address_info;
  switch (params.search_type) {
    case 'order_id':
      return normalizeText(order.order_id).includes(keyword);
    case 'title':
      return (order.order_detail?.product_infos || []).some(product => normalizeText(product.title).includes(keyword));
    case 'user_name':
      return normalizeText(address?.user_name).includes(keyword);
    case 'tel_number_last4':
      return [
        address?.tel_number,
        address?.purchaser_tel_number,
        address?.virtual_order_tel_number,
      ].some(value => normalizeText(value).endsWith(keyword));
    case 'merchant_notes':
      return normalizeText(ext?.merchant_notes).includes(keyword) || indexedText.includes(keyword);
    case 'customer_notes':
      return normalizeText(ext?.customer_notes).includes(keyword) || indexedText.includes(keyword);
    default:
      return indexedText.includes(keyword);
  }
}
