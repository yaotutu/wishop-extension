import { v4 as uuidv4 } from 'uuid';
import type { CreateShippingSessionInput, ShippingSession, ShippingSessionStatus } from '../../shared/types';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const sessions = new Map<string, ShippingSession>();
const sessionIdByTabId = new Map<number, string>();

function now(): number {
  return Date.now();
}

function pruneExpiredSessions(): void {
  const current = now();
  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt > current) continue;
    sessions.delete(sessionId);
    if (session.tabId !== undefined) sessionIdByTabId.delete(session.tabId);
  }
}

function getFreshSession(sessionId: string): ShippingSession | undefined {
  pruneExpiredSessions();
  return sessions.get(sessionId);
}

/**
 * Shipping sessions are intentionally kept in the background service worker only.
 * They bridge the dashboard and the Taobao content script without persisting
 * buyer/order data longer than the current fulfillment workflow needs.
 */
export async function createShippingSession(input: CreateShippingSessionInput): Promise<ShippingSession> {
  pruneExpiredSessions();
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
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: timestamp + SESSION_TTL_MS,
  };
  sessions.set(session.id, session);
  return session;
}

export async function bindShippingSessionToTab(sessionId: string, tabId: number): Promise<ShippingSession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('发货会话已过期，请从订单页重新打开');
  const next = { ...session, tabId, status: 'opened' as const, updatedAt: now() };
  sessions.set(sessionId, next);
  sessionIdByTabId.set(tabId, sessionId);
  return next;
}

export async function getShippingSessionByTab(tabId: number): Promise<ShippingSession | null> {
  const sessionId = sessionIdByTabId.get(tabId);
  if (!sessionId) return null;
  return getFreshSession(sessionId) || null;
}

export async function updateShippingSessionStatus(
  sessionId: string,
  status: ShippingSessionStatus,
  lastError?: string,
): Promise<ShippingSession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('发货会话已过期，请从订单页重新打开');
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
    const session = sessions.get(sessionId);
    if (session) sessions.set(sessionId, { ...session, tabId: undefined, updatedAt: now() });
  });
}
