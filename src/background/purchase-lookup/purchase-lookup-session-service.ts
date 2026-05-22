import { v4 as uuidv4 } from 'uuid';
import type { GlobalLogInput } from '../../shared/global-log';
import type {
  CreatePurchaseLookupSessionInput,
  LinkedPlatformOrder,
  OrderAssociation,
  PurchaseLookupSession,
  PurchaseLookupSessionStatus,
  TaobaoSecurityChallengeSnapshot,
  TaobaoPurchaseOrderSnapshot,
} from '../../shared/types';
import {
  recordTaskCompleted,
  recordTaskFailed,
  recordTaskQueued,
  recordTaskStarted,
  recordTaskWaitingUser,
} from '../global-logs/global-log-service';
import { getOrderAssociations, setOrderAssociation } from '../store/order-association-repository';
import { activateTaobaoWorkTab, ensureTaobaoTaskWorkTab, openTaobaoWorkTab } from '../taobao-workspace/work-tab-service';

const SESSION_TTL_MS = 30 * 60 * 1000;
const TAOBAO_ORDER_DETAIL_URL = 'https://trade.taobao.com/trade/detail/trade_order_detail.htm';
const sessions = new Map<string, PurchaseLookupSession>();
const sessionIdByTabId = new Map<number, string>();
let activeSessionId: string | undefined;
let startingNextSession = false;
const queuedSessionIds: string[] = [];

function now(): number {
  return Date.now();
}

function buildTaobaoOrderDetailUrl(platformOrderId: string): string {
  const url = new URL(TAOBAO_ORDER_DETAIL_URL);
  url.searchParams.set('biz_order_id', platformOrderId.trim());
  return url.toString();
}

function pruneExpiredSessions(): void {
  const current = now();
  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt > current) continue;
    sessions.delete(sessionId);
    if (session.tabId !== undefined) sessionIdByTabId.delete(session.tabId);
    if (activeSessionId === sessionId) activeSessionId = undefined;
  }
  for (let index = queuedSessionIds.length - 1; index >= 0; index -= 1) {
    if (!sessions.has(queuedSessionIds[index])) queuedSessionIds.splice(index, 1);
  }
}

function getFreshSession(sessionId: string): PurchaseLookupSession | undefined {
  pruneExpiredSessions();
  return sessions.get(sessionId);
}

function emitPurchaseLookupEvent(event: string, payload: unknown): void {
  chrome.runtime.sendMessage({ type: 'event', event, payload }).catch(() => {});
}

function purchaseLookupLogBase(session: PurchaseLookupSession): Omit<GlobalLogInput, 'eventType' | 'level' | 'title'> {
  return {
    module: 'orders',
    scope: 'account',
    accountId: session.accountId,
    taskKind: 'background',
    runId: session.id,
    metadata: {
      orderId: session.orderId,
      platformOrderId: session.platformOrderId,
      source: 'purchaseLookup',
    },
  };
}

function isTerminalSession(session: PurchaseLookupSession): boolean {
  return session.status === 'completed' || session.status === 'failed';
}

function hasActivePurchaseLookupSession(): boolean {
  if (!activeSessionId) return false;
  const active = getFreshSession(activeSessionId);
  if (active && !isTerminalSession(active)) return true;
  activeSessionId = undefined;
  return false;
}

async function startPurchaseLookupSession(sessionId: string): Promise<PurchaseLookupSession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('淘宝订单读取会话已过期，请重新读取');
  activeSessionId = sessionId;
  try {
    const tab = await openTaobaoWorkTab(buildTaobaoOrderDetailUrl(session.platformOrderId));
    if (!tab.id) throw new Error('无法创建淘宝工作页');
    return bindPurchaseLookupSessionToTab(session.id, tab.id);
  } catch (err) {
    activeSessionId = undefined;
    const message = err instanceof Error ? err.message : '打开淘宝工作页失败';
    await failPurchaseLookupSession(sessionId, message);
    throw err;
  }
}

async function startNextQueuedSession(): Promise<void> {
  if (startingNextSession || hasActivePurchaseLookupSession()) return;
  startingNextSession = true;
  try {
    while (!hasActivePurchaseLookupSession() && queuedSessionIds.length > 0) {
      const nextSessionId = queuedSessionIds.shift();
      if (!nextSessionId) continue;
      const session = getFreshSession(nextSessionId);
      if (!session || isTerminalSession(session)) continue;
      try {
        await startPurchaseLookupSession(nextSessionId);
      } catch {
        // Failed sessions emit their own user-facing event; continue draining the queue.
      }
    }
  } finally {
    startingNextSession = false;
  }
}

function notifyChallenge(session: PurchaseLookupSession, snapshot: TaobaoSecurityChallengeSnapshot): void {
  const notifications = (chrome as unknown as {
    notifications?: {
      create: (notificationId: string, options: {
        type: 'basic';
        iconUrl: string;
        title: string;
        message: string;
      }) => Promise<string> | void;
    };
  }).notifications;
  Promise.resolve(notifications?.create(`taobao-work-challenge-${session.id}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('/icon/128.png'),
    title: '淘宝工作页需要验证',
    message: snapshot.reason || '请完成淘宝安全验证，插件会继续读取订单信息。',
  })).catch(() => {});
}

async function savePurchaseSnapshot(
  session: PurchaseLookupSession,
  snapshot: TaobaoPurchaseOrderSnapshot,
): Promise<OrderAssociation> {
  const existing = (await getOrderAssociations(session.accountId)).find(item => item.orderId === session.orderId);
  const existingLinked = existing?.linkedOrders[0];
  const nowTs = now();
  const linkedOrder: LinkedPlatformOrder = {
    id: existingLinked?.id || uuidv4(),
    platform: 'taobao',
    platformOrderId: snapshot.platformOrderId || session.platformOrderId,
    platformOrderStatus: snapshot.platformOrderStatus || '',
    logisticsStatus: snapshot.logisticsStatus || '',
    logisticsCompany: snapshot.logisticsCompany || '',
    trackingNumber: snapshot.trackingNumber || '',
    remark: snapshot.remark || '',
    createdAt: existingLinked?.createdAt || nowTs,
    updatedAt: nowTs,
  };

  return setOrderAssociation(session.accountId, session.orderId, {
    internalRemark: existing?.internalRemark || '',
    linkedOrders: [linkedOrder],
  });
}

export async function createPurchaseLookupSession(input: CreatePurchaseLookupSessionInput): Promise<PurchaseLookupSession> {
  const platformOrderId = input.platformOrderId.trim();
  if (!platformOrderId) throw new Error('请输入淘宝订单号');
  pruneExpiredSessions();
  const timestamp = now();
  const session: PurchaseLookupSession = {
    id: uuidv4(),
    accountId: input.accountId,
    orderId: input.orderId,
    platformOrderId,
    status: 'created',
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: timestamp + SESSION_TTL_MS,
  };
  sessions.set(session.id, session);
  void recordTaskStarted({
    ...purchaseLookupLogBase(session),
    title: '淘宝订单读取任务已创建',
    detail: `淘宝订单号：${platformOrderId}`,
  });
  return session;
}

export async function bindPurchaseLookupSessionToTab(sessionId: string, tabId: number): Promise<PurchaseLookupSession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('淘宝订单读取会话已过期，请重新读取');
  const next = { ...session, tabId, status: 'opened' as const, updatedAt: now() };
  sessions.set(sessionId, next);
  sessionIdByTabId.set(tabId, sessionId);
  return next;
}

export async function getPurchaseLookupSessionByTab(tabId: number): Promise<PurchaseLookupSession | null> {
  const sessionId = sessionIdByTabId.get(tabId);
  if (!sessionId) return null;
  return getFreshSession(sessionId) || null;
}

export async function updatePurchaseLookupSessionStatus(
  sessionId: string,
  status: PurchaseLookupSessionStatus,
  lastError?: string,
): Promise<PurchaseLookupSession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('淘宝订单读取会话已过期，请重新读取');
  const next = { ...session, status, lastError, updatedAt: now() };
  sessions.set(sessionId, next);
  return next;
}

export async function openPurchaseLookupSessionTab(input: CreatePurchaseLookupSessionInput): Promise<PurchaseLookupSession> {
  const session = await createPurchaseLookupSession(input);
  await ensureTaobaoTaskWorkTab().catch(() => {});
  if (hasActivePurchaseLookupSession()) {
    const queued: PurchaseLookupSession = { ...session, status: 'queued', updatedAt: now() };
    sessions.set(session.id, queued);
    queuedSessionIds.push(session.id);
    void recordTaskQueued({
      ...purchaseLookupLogBase(queued),
      title: '淘宝订单读取已排队',
      detail: '淘宝工作页正在处理其他任务，当前任务会自动排队执行。',
    });
    return queued;
  }
  return startPurchaseLookupSession(session.id);
}

export async function reportPurchaseLookupChallenge(
  sessionId: string,
  snapshot: TaobaoSecurityChallengeSnapshot,
): Promise<PurchaseLookupSession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('淘宝订单读取会话已过期，请重新读取');
  const next: PurchaseLookupSession = {
    ...session,
    status: 'waiting-user-verification',
    challenge: snapshot,
    lastError: snapshot.reason || '淘宝工作页需要用户处理验证',
    updatedAt: now(),
  };
  sessions.set(sessionId, next);
  void recordTaskWaitingUser({
    ...purchaseLookupLogBase(next),
    title: '淘宝订单读取需要用户处理验证',
    detail: snapshot.reason || '淘宝工作页需要登录或安全验证。',
    metadata: {
      ...purchaseLookupLogBase(next).metadata,
      challengeKind: snapshot.kind,
    },
  });
  emitPurchaseLookupEvent('purchaseLookup:challenge', {
    accountId: next.accountId,
    orderId: next.orderId,
    reason: next.lastError,
  });
  notifyChallenge(next, snapshot);
  await activateTaobaoWorkTab();
  return next;
}

export async function resolvePurchaseLookupChallenge(sessionId: string): Promise<PurchaseLookupSession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('淘宝订单读取会话已过期，请重新读取');
  const next: PurchaseLookupSession = {
    ...session,
    status: 'page-ready',
    challenge: undefined,
    lastError: undefined,
    updatedAt: now(),
  };
  sessions.set(sessionId, next);
  return next;
}

export async function completePurchaseLookupSession(
  sessionId: string,
  snapshot: TaobaoPurchaseOrderSnapshot,
): Promise<OrderAssociation> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('淘宝订单读取会话已过期，请重新读取');
  const association = await savePurchaseSnapshot(session, snapshot);
  const next = { ...session, status: 'completed' as const, challenge: undefined, updatedAt: now() };
  sessions.set(sessionId, next);
  if (activeSessionId === sessionId) activeSessionId = undefined;
  void recordTaskCompleted({
    ...purchaseLookupLogBase(next),
    title: '淘宝订单读取完成',
    detail: `订单状态：${snapshot.platformOrderStatus || '-'}，物流状态：${snapshot.logisticsStatus || '-'}`,
  });
  emitPurchaseLookupEvent('purchaseLookup:completed', association);
  void startNextQueuedSession().catch(() => {});
  return association;
}

export async function failPurchaseLookupSession(sessionId: string, error: string): Promise<PurchaseLookupSession> {
  const session = await updatePurchaseLookupSessionStatus(sessionId, 'failed', error);
  if (activeSessionId === sessionId) activeSessionId = undefined;
  void recordTaskFailed({
    ...purchaseLookupLogBase(session),
    title: '淘宝订单读取失败',
    error: { message: error },
  });
  emitPurchaseLookupEvent('purchaseLookup:failed', {
    accountId: session.accountId,
    orderId: session.orderId,
    error,
  });
  void startNextQueuedSession().catch(() => {});
  return session;
}

export function installPurchaseLookupTabCleanup(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    const sessionId = sessionIdByTabId.get(tabId);
    if (!sessionId) return;
    sessionIdByTabId.delete(tabId);
    const session = sessions.get(sessionId);
    if (!session || session.status === 'completed' || session.status === 'failed') return;
    if (activeSessionId === sessionId) activeSessionId = undefined;
    const errorMessage = '淘宝订单工作页已关闭，无法继续读取订单状态';
    const next: PurchaseLookupSession = {
      ...session,
      tabId: undefined,
      status: 'failed',
      lastError: errorMessage,
      updatedAt: now(),
    };
    sessions.set(sessionId, next);
    void recordTaskFailed({
      ...purchaseLookupLogBase(next),
      title: '淘宝订单读取失败',
      error: { message: errorMessage },
    });
    emitPurchaseLookupEvent('purchaseLookup:failed', {
      accountId: session.accountId,
      orderId: session.orderId,
      error: errorMessage,
    });
    void startNextQueuedSession().catch(() => {});
  });
}
