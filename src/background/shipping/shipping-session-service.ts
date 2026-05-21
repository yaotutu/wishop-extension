import { v4 as uuidv4 } from 'uuid';
import type { CreateShippingSessionInput, LinkedPlatformOrder, OrderAssociation, ShippingSession, ShippingSessionStatus } from '../../shared/types';
import { getOrderAssociations, setOrderAssociation } from '../store/order-association-repository';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const sessions = new Map<string, ShippingSession>();
const sessionIdByTabId = new Map<number, string>();
let activeShippingSessionId: string | undefined;
let activeShippingTabId: number | undefined;

const SESSION_REPLACED_MESSAGE = '当前发货流程已被新的去发货操作替换，请从订单管理页重新点击去发货';

function now(): number {
  return Date.now();
}

function pruneExpiredSessions(): void {
  const current = now();
  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt > current) continue;
    sessions.delete(sessionId);
    if (session.tabId !== undefined) sessionIdByTabId.delete(session.tabId);
    if (activeShippingSessionId === sessionId) {
      activeShippingSessionId = undefined;
      activeShippingTabId = undefined;
    }
  }
}

function getFreshSession(sessionId: string): ShippingSession | undefined {
  pruneExpiredSessions();
  return sessions.get(sessionId);
}

function emitShippingEvent(event: string, payload: unknown): void {
  chrome.runtime.sendMessage({ type: 'event', event, payload }).catch(() => {});
}

function markSessionInactive(session: ShippingSession, message: string): ShippingSession {
  const next: ShippingSession = {
    ...session,
    status: 'failed',
    lastError: message,
    purchaseAssociationStatus: 'failed',
    purchaseAssociationMessage: message,
    updatedAt: now(),
  };
  sessions.set(session.id, next);
  emitShippingEvent('shipping:purchaseAssociationFailed', next);
  return next;
}

function clearActiveShippingSession(message = SESSION_REPLACED_MESSAGE): void {
  if (activeShippingSessionId) {
    const session = sessions.get(activeShippingSessionId);
    if (session && session.status !== 'completed' && session.status !== 'failed') {
      markSessionInactive(session, message);
    }
  }
  if (activeShippingTabId !== undefined) {
    sessionIdByTabId.delete(activeShippingTabId);
  }
  activeShippingSessionId = undefined;
  activeShippingTabId = undefined;
}

function assertActiveSession(session: ShippingSession): void {
  if (session.id !== activeShippingSessionId) {
    throw new Error(SESSION_REPLACED_MESSAGE);
  }
  if (session.tabId !== undefined && session.tabId !== activeShippingTabId) {
    throw new Error(SESSION_REPLACED_MESSAGE);
  }
}

function readPaySuccessOrderId(url?: string): string {
  if (!url) return '';
  try {
    const current = new URL(url);
    if (current.hostname !== 'web.m.taobao.com') return '';
    if (!current.pathname.includes('/app/tbpc-trade/tbpc-pay-success/home')) return '';
    return current.searchParams.get('biz_order_id')?.trim() || '';
  } catch {
    return '';
  }
}

async function savePaidTaobaoOrderAssociation(session: ShippingSession, platformOrderId: string): Promise<OrderAssociation> {
  const existing = (await getOrderAssociations(session.accountId)).find(item => item.orderId === session.orderId);
  const existingLinked = existing?.linkedOrders[0];
  const timestamp = now();
  const linkedOrder: LinkedPlatformOrder = {
    id: existingLinked?.id || uuidv4(),
    platform: 'taobao',
    platformOrderId,
    platformOrderStatus: '支付成功',
    logisticsStatus: '待发货',
    logisticsCompany: existingLinked?.logisticsCompany || '',
    trackingNumber: existingLinked?.trackingNumber || '',
    remark: existingLinked?.remark || '支付成功页自动关联',
    createdAt: existingLinked?.createdAt || timestamp,
    updatedAt: timestamp,
  };

  return setOrderAssociation(session.accountId, session.orderId, {
    internalRemark: existing?.internalRemark || '',
    linkedOrders: [linkedOrder],
  });
}

async function handleShippingTabUrlChange(tabId: number, url?: string): Promise<void> {
  const platformOrderId = readPaySuccessOrderId(url);
  if (!platformOrderId) return;

  const session = await getShippingSessionByTab(tabId);
  if (!session) return;
  if (session.linkedPlatformOrderId === platformOrderId && session.purchaseAssociationStatus === 'associated') return;

  const detected: ShippingSession = {
    ...session,
    status: 'page-ready',
    purchaseAssociationStatus: 'detected',
    purchaseAssociationMessage: `检测到淘宝订单：${platformOrderId}`,
    linkedPlatformOrderId: platformOrderId,
    updatedAt: now(),
  };
  sessions.set(session.id, detected);
  emitShippingEvent('shipping:purchaseDetected', detected);

  try {
    const association = await savePaidTaobaoOrderAssociation(detected, platformOrderId);
    const associated: ShippingSession = {
      ...detected,
      status: 'completed',
      purchaseAssociationStatus: 'associated',
      purchaseAssociationMessage: `已关联淘宝订单：${platformOrderId}`,
      updatedAt: now(),
    };
    sessions.set(session.id, associated);
    emitShippingEvent('shipping:purchaseAssociated', { session: associated, association });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed: ShippingSession = {
      ...detected,
      status: 'failed',
      lastError: message,
      purchaseAssociationStatus: 'failed',
      purchaseAssociationMessage: `检测到淘宝订单 ${platformOrderId}，但关联失败：${message}`,
      updatedAt: now(),
    };
    sessions.set(session.id, failed);
    emitShippingEvent('shipping:purchaseAssociationFailed', failed);
  }
}

/**
 * Shipping sessions are intentionally kept in the background service worker only.
 * They bridge the dashboard and the Taobao content script without persisting
 * buyer/order data longer than the current fulfillment workflow needs.
 */
export async function createShippingSession(input: CreateShippingSessionInput): Promise<ShippingSession> {
  pruneExpiredSessions();
  clearActiveShippingSession();
  const timestamp = now();
  const session: ShippingSession = {
    id: uuidv4(),
    accountId: input.accountId,
    orderId: input.orderId,
    productId: input.productId,
    source: {
      id: input.source.id,
      url: input.source.url,
      quantity: input.source.quantity,
      remark: input.source.remark,
    },
    order: input.order,
    status: 'created',
    purchaseAssociationStatus: 'waiting-payment',
    purchaseAssociationMessage: '等待淘宝付款完成',
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: timestamp + SESSION_TTL_MS,
  };
  sessions.set(session.id, session);
  activeShippingSessionId = session.id;
  return session;
}

export async function bindShippingSessionToTab(sessionId: string, tabId: number): Promise<ShippingSession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('发货会话已过期，请从订单页重新打开');
  if (activeShippingSessionId && activeShippingSessionId !== sessionId) {
    clearActiveShippingSession();
  }
  if (activeShippingTabId !== undefined && activeShippingTabId !== tabId) {
    sessionIdByTabId.delete(activeShippingTabId);
  }
  const next = { ...session, tabId, status: 'opened' as const, updatedAt: now() };
  sessions.set(sessionId, next);
  sessionIdByTabId.set(tabId, sessionId);
  activeShippingSessionId = sessionId;
  activeShippingTabId = tabId;
  return next;
}

export async function getShippingSessionByTab(tabId: number): Promise<ShippingSession | null> {
  if (tabId !== activeShippingTabId) return null;
  const sessionId = sessionIdByTabId.get(tabId);
  if (!sessionId) return null;
  if (sessionId !== activeShippingSessionId) return null;
  return getFreshSession(sessionId) || null;
}

export async function updateShippingSessionStatus(
  sessionId: string,
  status: ShippingSessionStatus,
  lastError?: string,
): Promise<ShippingSession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('发货会话已过期，请从订单页重新打开');
  assertActiveSession(session);
  const next: ShippingSession = {
    ...session,
    status,
    lastError,
    updatedAt: now(),
  };
  sessions.set(sessionId, next);
  return next;
}

export async function openShippingSessionTab(input: CreateShippingSessionInput): Promise<ShippingSession> {
  const session = await createShippingSession(input);
  const tab = await chrome.tabs.create({ url: input.source.url });
  if (!tab.id) return session;
  return bindShippingSessionToTab(session.id, tab.id);
}

export function installShippingTabCleanup(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    const sessionId = sessionIdByTabId.get(tabId);
    if (!sessionId) return;
    sessionIdByTabId.delete(tabId);
    if (activeShippingTabId === tabId) {
      activeShippingSessionId = undefined;
      activeShippingTabId = undefined;
    }
    const session = sessions.get(sessionId);
    if (session) sessions.set(sessionId, { ...session, tabId: undefined, updatedAt: now() });
  });
}

export function installShippingPaymentSuccessWatcher(): void {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const url = changeInfo.url || tab.url;
    void handleShippingTabUrlChange(tabId, url).catch(() => {});
  });
}
