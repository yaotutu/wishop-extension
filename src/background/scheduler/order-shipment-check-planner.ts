import type { Order, OrderAssociation } from '../../shared/types';
import { OrderStatus } from '../../shared/types';
import type { ShipmentCheckSettings } from '../../shared/settings';
import { normalizeLinkedPurchaseOrder } from '../../shared/purchase-status';

export interface ShipmentCheckCandidate {
  accountId: string;
  orderId: string;
  platformOrderId: string;
}

export interface SelectShipmentCheckCandidatesInput {
  accountId: string;
  orders: Order[];
  associationsByOrderId: Record<string, OrderAssociation>;
  settings: ShipmentCheckSettings;
  now: number;
  activeKeys: Set<string>;
}

export interface ShipmentCheckDispatchPlanItem extends ShipmentCheckCandidate {
  scheduledAt: number;
}

export interface BuildShipmentCheckDispatchPlanInput {
  candidates: ShipmentCheckCandidate[];
  settings: ShipmentCheckSettings;
  now: number;
  random?: () => number;
}

const TERMINAL_PURCHASE_STATUS_KEYWORDS = ['交易关闭', '退款成功', '退货退款成功', '交易成功'];

export function shipmentCheckKey(accountId: string, orderId: string, platformOrderId: string): string {
  return `${accountId}:${orderId}:${platformOrderId}`;
}

function hasWxDelivery(order: Order): boolean {
  return (order.order_detail?.delivery_info?.delivery_product_info || []).length > 0;
}

function isRecentEnough(order: Order, settings: ShipmentCheckSettings, now: number): boolean {
  const orderTimeMs = order.create_time * 1000;
  return orderTimeMs >= now - settings.orderLookbackDays * 24 * 60 * 60 * 1000;
}

function isTerminalPurchaseStatus(status: string): boolean {
  return TERMINAL_PURCHASE_STATUS_KEYWORDS.some(keyword => status.includes(keyword));
}

function isCheckAlreadyPending(status: string | undefined, nextCheckAfter: number | undefined, now: number): boolean {
  if (status !== 'queued' && status !== 'running' && status !== 'waiting_user') return false;
  return !!nextCheckAfter && nextCheckAfter > now;
}

export function selectShipmentCheckCandidates(input: SelectShipmentCheckCandidatesInput): ShipmentCheckCandidate[] {
  const candidates: ShipmentCheckCandidate[] = [];
  for (const order of input.orders) {
    if (candidates.length >= input.settings.maxChecksPerAccountPerWindow) break;
    if (order.status !== OrderStatus.PendingShipment) continue;
    if (hasWxDelivery(order)) continue;
    if (!isRecentEnough(order, input.settings, input.now)) continue;

    const association = input.associationsByOrderId[order.order_id];
    const linked = association?.linkedOrders[0] ? normalizeLinkedPurchaseOrder(association.linkedOrders[0]) : undefined;
    if (!linked || linked.platform !== 'taobao') continue;
    const platformOrderId = linked.platformOrderId?.trim();
    if (!platformOrderId) continue;
    if (isCheckAlreadyPending(linked.lastShipmentCheckStatus, linked.nextShipmentCheckAfter, input.now)) continue;
    if (linked.nextShipmentCheckAfter && linked.nextShipmentCheckAfter > input.now) continue;
    if (isTerminalPurchaseStatus(linked.platformOrderStatus || '')) continue;
    if (linked.logisticsCompany?.trim() && linked.trackingNumber?.trim()) continue;

    const key = shipmentCheckKey(input.accountId, order.order_id, platformOrderId);
    if (input.activeKeys.has(key)) continue;
    candidates.push({ accountId: input.accountId, orderId: order.order_id, platformOrderId });
  }
  return candidates;
}

function randBetween(min: number, max: number, random: () => number): number {
  if (max <= min) return min;
  return min + Math.floor(random() * (max - min));
}

export function buildShipmentCheckDispatchPlan(input: BuildShipmentCheckDispatchPlanInput): ShipmentCheckDispatchPlanItem[] {
  const random = input.random || Math.random;
  const minDelayMs = input.settings.minDispatchDelaySeconds * 1000;
  const maxDelayMs = input.settings.maxDispatchDelaySeconds * 1000;
  const minSpacingMs = input.settings.minTaskSpacingSeconds * 1000;
  const maxFit = Math.max(1, Math.floor((maxDelayMs - minDelayMs) / minSpacingMs) + 1);
  const candidates = input.candidates.slice(0, Math.min(input.settings.maxChecksPerAccountPerWindow, maxFit));
  const count = candidates.length;

  return candidates.map((candidate, index) => {
    const start = minDelayMs + index * minSpacingMs;
    const end = maxDelayMs - (count - 1 - index) * minSpacingMs;
    return {
      ...candidate,
      scheduledAt: input.now + randBetween(start, Math.max(start, end), random),
    };
  });
}
