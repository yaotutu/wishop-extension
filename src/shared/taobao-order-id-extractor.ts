import type { Order } from './types.ts';

// 淘宝订单号是纯数字串，长度通常在 15-20 位之间。
// 这里取保守区间 15-20，既能覆盖常见订单号，又能排除手机号（11 位）等短数字误命中。
const TAOBAO_ORDER_ID_MIN_LENGTH = 15;
const TAOBAO_ORDER_ID_MAX_LENGTH = 20;
const TAOBAO_ORDER_ID_PATTERN = new RegExp(`\\b\\d{${TAOBAO_ORDER_ID_MIN_LENGTH},${TAOBAO_ORDER_ID_MAX_LENGTH}}\\b`, 'g');

// 从微信订单的卖家备注里提取淘宝采购单号。
// 规则：匹配长度 15-20 的纯数字串。只取第一个命中，避免一条备注里多个数字造成歧义。
export function extractTaobaoOrderIdFromMerchantNotes(order: Order): string | null {
  const notes = order.order_detail?.ext_info?.merchant_notes?.trim();
  if (!notes) return null;
  const matches = notes.match(TAOBAO_ORDER_ID_PATTERN);
  if (!matches || matches.length === 0) return null;
  return matches[0];
}
