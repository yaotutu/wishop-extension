import { v4 as uuidv4 } from 'uuid';
import type {
  CreateShippingSessionInput,
  OrderAssociation,
  ShippingPaymentWorkflow,
  ShippingSession,
  ShippingSessionStatus,
} from '../../shared/types';
import { ensureTaobaoTaskWorkTab, openTaobaoShippingWorkTab } from '../taobao-workspace/work-tab-service';
import { openPurchaseLookupSessionTab } from '../purchase-lookup/purchase-lookup-session-service';
import { applyLinkedOrder } from '../orders/order-association-service';
import { requireTaobaoLoggedIn } from '../taobao-login/taobao-login-service';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_PAYMENT_WORKFLOW: ShippingPaymentWorkflow = 'manualPasswordPayment';
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

function readManualPasswordPaymentSuccessOrderId(url?: string): string {
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

function readPaymentSuccessOrderId(workflow: ShippingPaymentWorkflow, url?: string): string {
  switch (workflow) {
    case 'manualPasswordPayment':
      return readManualPasswordPaymentSuccessOrderId(url);
    default:
      return '';
  }
}

async function savePaidTaobaoOrderAssociation(session: ShippingSession, platformOrderId: string): Promise<OrderAssociation> {
  // 付款成功页抓取的订单号走统一关联入口，由优先级表决定是否写入。
  const outcome = await applyLinkedOrder({
    accountId: session.accountId,
    orderId: session.orderId,
    platformOrderId,
    linkSource: 'payment_success',
    remark: '淘宝付款完成页自动关联',
  });
  if (!outcome.written) {
    throw new Error('当前订单已有更高优先级的采购关联，付款页抓取被跳过');
  }
  return outcome.association;
}

async function startPaidTaobaoOrderStatusLookup(session: ShippingSession, platformOrderId: string): Promise<void> {
  await openPurchaseLookupSessionTab({
    accountId: session.accountId,
    orderId: session.orderId,
    platformOrderId,
  });
}

async function handleShippingTabUrlChange(tabId: number, url?: string): Promise<void> {
  const session = await getShippingSessionByTab(tabId);
  if (!session) return;

  const platformOrderId = readPaymentSuccessOrderId(session.paymentWorkflow, url);
  if (!platformOrderId) return;
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
    await startPaidTaobaoOrderStatusLookup(detected, platformOrderId).catch(() => {});
    const associated: ShippingSession = {
      ...detected,
      status: 'completed',
      purchaseAssociationStatus: 'associated',
      purchaseAssociationMessage: `已关联淘宝订单：${platformOrderId}，正在同步发货状态`,
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
    paymentWorkflow: input.paymentWorkflow || DEFAULT_PAYMENT_WORKFLOW,
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
  // 前置登录态 gate：未登录直接拒绝，不建会话也不开工作页，避免产生脏数据。
  await requireTaobaoLoggedIn();
  const session = await createShippingSession(input);
  await ensureTaobaoTaskWorkTab().catch(() => {});
  const tab = await openTaobaoShippingWorkTab(input.source.url);
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
