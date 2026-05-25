import { v4 as uuidv4 } from 'uuid';
import type { GlobalLogInput } from '../../shared/global-log';
import type {
  CreateTaobaoRefundSessionInput,
  TaobaoRefundPrepareSnapshot,
  TaobaoRefundSession,
  TaobaoRefundSessionStatus,
  TaobaoSecurityChallengeSnapshot,
} from '../../shared/types';
import {
  recordTaskCompleted,
  recordTaskFailed,
  recordTaskStarted,
  recordTaskWaitingUser,
} from '../global-logs/global-log-service';
import { activateTaobaoWorkTab, openTaobaoWorkTab } from '../taobao-workspace/work-tab-service';

const SESSION_TTL_MS = 30 * 60 * 1000;
const DEFAULT_REFUND_REASON = '不想要了';
const TAOBAO_REFUND_APPLY_URL = 'https://refund2.taobao.com/dispute/apply.htm';

const sessions = new Map<string, TaobaoRefundSession>();
const sessionIdByTabId = new Map<number, string>();
let activeSessionId: string | undefined;

function now(): number {
  return Date.now();
}

function buildTaobaoRefundApplyUrl(platformOrderId: string): string {
  const url = new URL(TAOBAO_REFUND_APPLY_URL);
  url.searchParams.set('bizOrderId', platformOrderId.trim());
  url.searchParams.set('type', '1');
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
}

function getFreshSession(sessionId: string): TaobaoRefundSession | undefined {
  pruneExpiredSessions();
  return sessions.get(sessionId);
}

function emitTaobaoRefundEvent(event: string, payload: unknown): void {
  chrome.runtime.sendMessage({ type: 'event', event, payload }).catch(() => {});
}

function taobaoRefundLogBase(session: TaobaoRefundSession): Omit<GlobalLogInput, 'eventType' | 'level' | 'title'> {
  return {
    module: 'orders',
    scope: 'account',
    accountId: session.accountId,
    taskKind: 'manual',
    runId: session.id,
    metadata: {
      orderId: session.orderId,
      platformOrderId: session.platformOrderId,
      source: 'taobaoRefund',
    },
  };
}

function isTerminalSession(session: TaobaoRefundSession): boolean {
  return session.status === 'prepared' || session.status === 'submitted' || session.status === 'failed';
}

export async function openTaobaoRefundSessionTab(input: CreateTaobaoRefundSessionInput): Promise<TaobaoRefundSession> {
  const platformOrderId = input.platformOrderId.trim();
  if (!platformOrderId) throw new Error('当前订单还没有关联淘宝订单号');
  pruneExpiredSessions();

  const timestamp = now();
  const session: TaobaoRefundSession = {
    id: uuidv4(),
    accountId: input.accountId,
    orderId: input.orderId,
    platformOrderId,
    reason: input.reason?.trim() || DEFAULT_REFUND_REASON,
    autoSubmit: !!input.autoSubmit,
    status: 'created',
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: timestamp + SESSION_TTL_MS,
  };
  sessions.set(session.id, session);
  activeSessionId = session.id;
  void recordTaskStarted({
    ...taobaoRefundLogBase(session),
    title: '淘宝退款申请页已打开',
    detail: `淘宝订单号：${platformOrderId}`,
    metadata: {
      ...taobaoRefundLogBase(session).metadata,
      autoSubmit: session.autoSubmit,
    },
  });

  try {
    const tab = await openTaobaoWorkTab(buildTaobaoRefundApplyUrl(platformOrderId));
    if (!tab.id) throw new Error('无法创建淘宝退款工作页');
    const next: TaobaoRefundSession = {
      ...session,
      tabId: tab.id,
      status: 'opened',
      updatedAt: now(),
    };
    sessions.set(session.id, next);
    sessionIdByTabId.set(tab.id, session.id);
    await activateTaobaoWorkTab();
    return next;
  } catch (err) {
    activeSessionId = undefined;
    const message = err instanceof Error ? err.message : '打开淘宝退款工作页失败';
    await failTaobaoRefundSession(session.id, message);
    throw err;
  }
}

export async function getTaobaoRefundSessionByTab(tabId: number): Promise<TaobaoRefundSession | null> {
  const sessionId = sessionIdByTabId.get(tabId);
  if (!sessionId) return null;
  return getFreshSession(sessionId) || null;
}

export async function updateTaobaoRefundSessionStatus(
  sessionId: string,
  status: TaobaoRefundSessionStatus,
  lastError?: string,
): Promise<TaobaoRefundSession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('淘宝退款申请会话已过期，请重新打开');
  const next = { ...session, status, lastError, updatedAt: now() };
  sessions.set(sessionId, next);
  return next;
}

export async function reportTaobaoRefundChallenge(
  sessionId: string,
  snapshot: TaobaoSecurityChallengeSnapshot,
): Promise<TaobaoRefundSession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('淘宝退款申请会话已过期，请重新打开');
  const next: TaobaoRefundSession = {
    ...session,
    status: 'waiting-user-verification',
    challenge: snapshot,
    lastError: snapshot.reason || '淘宝退款页需要用户处理验证',
    updatedAt: now(),
  };
  sessions.set(sessionId, next);
  void recordTaskWaitingUser({
    ...taobaoRefundLogBase(next),
    title: '淘宝退款申请需要用户处理验证',
    detail: snapshot.reason || '淘宝退款页需要登录或安全验证。',
    notification: {
      topic: 'taobao.security_challenge',
      urgency: 'important',
    },
    metadata: {
      ...taobaoRefundLogBase(next).metadata,
      challengeKind: snapshot.kind,
    },
  });
  emitTaobaoRefundEvent('taobaoRefund:challenge', {
    accountId: next.accountId,
    orderId: next.orderId,
    reason: next.lastError,
  });
  await activateTaobaoWorkTab();
  return next;
}

export async function resolveTaobaoRefundChallenge(sessionId: string): Promise<TaobaoRefundSession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('淘宝退款申请会话已过期，请重新打开');
  const next: TaobaoRefundSession = {
    ...session,
    status: 'page-ready',
    challenge: undefined,
    lastError: undefined,
    updatedAt: now(),
  };
  sessions.set(sessionId, next);
  return next;
}

export async function completeTaobaoRefundPreparation(
  sessionId: string,
  snapshot: TaobaoRefundPrepareSnapshot,
): Promise<TaobaoRefundSession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('淘宝退款申请会话已过期，请重新打开');
  const next: TaobaoRefundSession = {
    ...session,
    status: 'prepared',
    challenge: undefined,
    updatedAt: now(),
  };
  sessions.set(sessionId, next);
  if (activeSessionId === sessionId) activeSessionId = undefined;
  void recordTaskCompleted({
    ...taobaoRefundLogBase(next),
    title: '淘宝退款申请页已准备',
    detail: `退款原因：${snapshot.selectedReason || '-'}，提交按钮：${snapshot.submitReady ? '可手动提交' : '未就绪'}`,
    metadata: {
      ...taobaoRefundLogBase(next).metadata,
      selectedReason: snapshot.selectedReason,
      submitReady: snapshot.submitReady,
    },
  });
  emitTaobaoRefundEvent('taobaoRefund:prepared', next);
  return next;
}

export async function completeTaobaoRefundSubmission(
  sessionId: string,
  snapshot: TaobaoRefundPrepareSnapshot,
): Promise<TaobaoRefundSession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('淘宝退款申请会话已过期，请重新打开');
  const next: TaobaoRefundSession = {
    ...session,
    status: 'submitted',
    challenge: undefined,
    updatedAt: now(),
  };
  sessions.set(sessionId, next);
  if (activeSessionId === sessionId) activeSessionId = undefined;
  void recordTaskCompleted({
    ...taobaoRefundLogBase(next),
    title: '淘宝退款申请已自动提交',
    detail: `退款原因：${snapshot.selectedReason || '-'}，退款金额：${snapshot.refundAmountText || '-'}`,
    metadata: {
      ...taobaoRefundLogBase(next).metadata,
      selectedReason: snapshot.selectedReason,
      refundAmountText: snapshot.refundAmountText,
      autoSubmitted: true,
    },
  });
  emitTaobaoRefundEvent('taobaoRefund:submitted', next);
  return next;
}

export async function failTaobaoRefundSession(sessionId: string, error: string): Promise<TaobaoRefundSession> {
  const session = await updateTaobaoRefundSessionStatus(sessionId, 'failed', error);
  if (activeSessionId === sessionId) activeSessionId = undefined;
  void recordTaskFailed({
    ...taobaoRefundLogBase(session),
    title: '淘宝退款申请准备失败',
    error: { message: error },
    notification: {
      topic: 'orders.refund_failed',
      urgency: 'important',
    },
  });
  emitTaobaoRefundEvent('taobaoRefund:failed', {
    accountId: session.accountId,
    orderId: session.orderId,
    error,
  });
  return session;
}

export function installTaobaoRefundTabCleanup(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    const sessionId = sessionIdByTabId.get(tabId);
    if (!sessionId) return;
    sessionIdByTabId.delete(tabId);
    const session = sessions.get(sessionId);
    if (!session || isTerminalSession(session)) return;
    if (activeSessionId === sessionId) activeSessionId = undefined;
    const errorMessage = '淘宝退款工作页已关闭，无法继续准备退款申请';
    const next: TaobaoRefundSession = {
      ...session,
      tabId: undefined,
      status: 'failed',
      lastError: errorMessage,
      updatedAt: now(),
    };
    sessions.set(sessionId, next);
    void recordTaskFailed({
      ...taobaoRefundLogBase(next),
      title: '淘宝退款申请准备失败',
      error: { message: errorMessage },
      notification: {
        topic: 'orders.refund_failed',
        urgency: 'important',
      },
    });
    emitTaobaoRefundEvent('taobaoRefund:failed', {
      accountId: session.accountId,
      orderId: session.orderId,
      error: errorMessage,
    });
  });
}
