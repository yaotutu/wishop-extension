import { v4 as uuidv4 } from 'uuid';
import type {
  ProductCopyRecord,
  CreateProductCopySessionInput,
  ProductCopySession,
  ProductCopySessionStatus,
  TaobaoProductSnapshot,
  TaobaoSecurityChallengeSnapshot,
} from '../../shared/types.ts';
import {
  recordActivityCompleted,
  recordActivityFailed,
  recordActivityQueued,
  recordActivityStarted,
  recordActivityWaitingUser,
} from '../activity-logs/activity-log-service.ts';
import {
  listProductCopyRecords,
  removeProductCopyRecord,
  saveProductCopyRecord,
} from '../store/product-copy-record-repository.ts';
import { activateTaobaoWorkTab, openTaobaoWorkTab } from '../taobao-workspace/work-tab-service.ts';
import { enrichTaobaoProductSnapshotWithItemcat } from './taobao-itemcat-lookup.ts';
import { requireTaobaoLoggedIn } from '../taobao-login/taobao-login-service.ts';

const SESSION_TTL_MS = 30 * 60 * 1000;
const sessions = new Map<string, ProductCopySession>();
const sessionIdByTabId = new Map<number, string>();
const queuedSessionIds: string[] = [];
let activeSessionId: string | undefined;
let startingNextSession = false;

function now(): number {
  return Date.now();
}

function normalizeTaobaoProductUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error('请输入有效的淘宝或天猫商品链接');
  }
  const host = url.hostname.toLowerCase();
  const isTaobao = host === 'item.taobao.com';
  const isTmall = host === 'detail.tmall.com' || host.endsWith('.tmall.com');
  if ((!isTaobao && !isTmall) || !url.searchParams.get('id')) {
    throw new Error('请输入淘宝或天猫商品详情页链接');
  }
  const normalized = new URL(`${url.protocol}//${url.hostname}${url.pathname}`);
  normalized.searchParams.set('id', url.searchParams.get('id')!.trim());
  const skuId = url.searchParams.get('skuId')?.trim();
  if (skuId) normalized.searchParams.set('skuId', skuId);
  return normalized.toString();
}

function emitProductCopyEvent(event: string, payload: unknown): void {
  chrome.runtime.sendMessage({ type: 'event', event, payload }).catch(() => {});
}

function pruneExpiredSessions(): void {
  const timestamp = now();
  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt > timestamp) continue;
    sessions.delete(sessionId);
    if (session.tabId !== undefined) sessionIdByTabId.delete(session.tabId);
    if (activeSessionId === sessionId) activeSessionId = undefined;
  }
  for (let index = queuedSessionIds.length - 1; index >= 0; index -= 1) {
    if (!sessions.has(queuedSessionIds[index])) queuedSessionIds.splice(index, 1);
  }
}

function getFreshSession(sessionId: string): ProductCopySession | undefined {
  pruneExpiredSessions();
  return sessions.get(sessionId);
}

function isTerminalSession(session: ProductCopySession): boolean {
  return session.status === 'completed' || session.status === 'failed';
}

export function hasActiveProductCopySession(): boolean {
  if (!activeSessionId) return false;
  const active = getFreshSession(activeSessionId);
  if (active && !isTerminalSession(active)) return true;
  activeSessionId = undefined;
  return false;
}

function productCopyLogBase(session: ProductCopySession) {
  return {
    domain: 'productCopy' as const,
    scope: 'global' as const,
    trigger: 'background' as const,
    runId: session.id,
    metadata: {
      url: session.url,
      source: 'productCopy',
    },
  };
}

function missingFields(snapshot: TaobaoProductSnapshot): string[] {
  const missing: string[] = [];
  if (!snapshot.title) missing.push('title');
  if (snapshot.images.main.length === 0) missing.push('mainImages');
  if (snapshot.images.detail.length === 0) missing.push('detailImages');
  if (snapshot.sku.matrix.length === 0) missing.push('skuMatrix');
  if (snapshot.params.length === 0) missing.push('productParams');
  return missing;
}

function toProductCopyRecord(snapshot: TaobaoProductSnapshot, existing?: ProductCopyRecord | null): ProductCopyRecord {
  const timestamp = now();
  return {
    ...snapshot,
    id: `${snapshot.identity.platform}:${snapshot.identity.itemId}`,
    sourceUrl: snapshot.identity.url,
    missingFields: missingFields(snapshot),
    updatedAt: timestamp,
    collectedAt: snapshot.collectedAt || existing?.collectedAt || timestamp,
  };
}

async function startProductCopySession(sessionId: string): Promise<ProductCopySession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('商品采集会话已过期，请重新采集');
  activeSessionId = sessionId;
  try {
    const tab = await openTaobaoWorkTab(session.url);
    if (!tab.id) throw new Error('无法创建淘宝商品工作页');
    return bindProductCopySessionToTab(session.id, tab.id);
  } catch (error) {
    activeSessionId = undefined;
    const message = error instanceof Error ? error.message : '打开淘宝商品工作页失败';
    await failProductCopySession(sessionId, message);
    throw error;
  }
}

async function startNextQueuedSession(): Promise<void> {
  if (startingNextSession || hasActiveProductCopySession()) return;
  startingNextSession = true;
  try {
    while (!hasActiveProductCopySession() && queuedSessionIds.length > 0) {
      const sessionId = queuedSessionIds.shift();
      if (!sessionId) continue;
      const session = getFreshSession(sessionId);
      if (!session || isTerminalSession(session)) continue;
      try {
        await startProductCopySession(sessionId);
      } catch {
        // 单个采集任务失败后继续处理队列，失败事件由 fail 方法负责通知 UI。
      }
    }
  } finally {
    startingNextSession = false;
  }
}

export async function openProductCopySession(
  input: CreateProductCopySessionInput,
): Promise<ProductCopySession> {
  // 前置登录态 gate：未登录直接拒绝，不查复用、不建会话、不入队。
  await requireTaobaoLoggedIn();
  const url = normalizeTaobaoProductUrl(input.url);
  pruneExpiredSessions();
  const existing = Array.from(sessions.values()).find(session => !isTerminalSession(session) && session.url === url);
  if (existing) return existing;

  const timestamp = now();
  const session: ProductCopySession = {
    id: uuidv4(),
    url,
    status: 'created',
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: timestamp + SESSION_TTL_MS,
  };
  sessions.set(session.id, session);
  void recordActivityStarted({
    ...productCopyLogBase(session),
    title: '淘宝商品采集任务已创建',
    detail: `商品链接：${url}`,
  });

  if (hasActiveProductCopySession()) {
    const queued: ProductCopySession = { ...session, status: 'queued', updatedAt: now() };
    sessions.set(session.id, queued);
    queuedSessionIds.push(session.id);
    void recordActivityQueued({
      ...productCopyLogBase(queued),
      title: '淘宝商品采集已排队',
      detail: '淘宝工作页正在处理其他任务，当前商品会自动排队采集。',
    });
    return queued;
  }
  return startProductCopySession(session.id);
}

export async function bindProductCopySessionToTab(
  sessionId: string,
  tabId: number,
): Promise<ProductCopySession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('商品采集会话已过期，请重新采集');
  const next = { ...session, tabId, status: 'opened' as const, updatedAt: now() };
  sessions.set(sessionId, next);
  sessionIdByTabId.set(tabId, sessionId);
  return next;
}

export async function getProductCopySessionByTab(tabId: number): Promise<ProductCopySession | null> {
  const sessionId = sessionIdByTabId.get(tabId);
  if (!sessionId) return null;
  return getFreshSession(sessionId) || null;
}

export async function updateProductCopySessionStatus(
  sessionId: string,
  status: ProductCopySessionStatus,
  lastError?: string,
): Promise<ProductCopySession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('商品采集会话已过期，请重新采集');
  const next = { ...session, status, lastError, updatedAt: now() };
  sessions.set(sessionId, next);
  return next;
}

export async function reportProductCopyChallenge(
  sessionId: string,
  snapshot: TaobaoSecurityChallengeSnapshot,
): Promise<ProductCopySession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('商品采集会话已过期，请重新采集');
  const next: ProductCopySession = {
    ...session,
    status: 'waiting-user-verification',
    challenge: snapshot,
    lastError: snapshot.reason || '淘宝商品页需要用户处理验证',
    updatedAt: now(),
  };
  sessions.set(sessionId, next);
  void recordActivityWaitingUser({
    ...productCopyLogBase(next),
    title: '淘宝商品采集需要用户处理验证',
    detail: next.lastError,
    notification: {
      topic: 'taobao.security_challenge',
      urgency: 'important',
    },
  });
  emitProductCopyEvent('productCopy:challenge', {
    url: next.url,
    reason: next.lastError,
  });
  await activateTaobaoWorkTab();
  return next;
}

export async function resolveProductCopyChallenge(sessionId: string): Promise<ProductCopySession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('商品采集会话已过期，请重新采集');
  const next: ProductCopySession = {
    ...session,
    status: 'page-ready',
    challenge: undefined,
    lastError: undefined,
    updatedAt: now(),
  };
  sessions.set(sessionId, next);
  return next;
}

export async function completeProductCopySession(
  sessionId: string,
  snapshot: TaobaoProductSnapshot,
): Promise<ProductCopyRecord> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('商品采集会话已过期，请重新采集');
  const enrichedSnapshot = await enrichTaobaoProductSnapshotWithItemcat(snapshot);
  const listing = await saveProductCopyRecord(toProductCopyRecord(enrichedSnapshot));
  const next = {
    ...session,
    status: 'completed' as const,
    copyId: listing.id,
    challenge: undefined,
    updatedAt: now(),
  };
  sessions.set(sessionId, next);
  if (activeSessionId === sessionId) activeSessionId = undefined;
  void recordActivityCompleted({
    ...productCopyLogBase(next),
    title: '淘宝商品采集完成',
    detail: `${listing.title || listing.identity.itemId}，SKU ${listing.sku.matrix.length} 个，参数 ${listing.params.length} 项`,
  });
  emitProductCopyEvent('productCopy:completed', listing);
  void startNextQueuedSession().catch(() => {});
  return listing;
}

export async function failProductCopySession(
  sessionId: string,
  error: string,
): Promise<ProductCopySession> {
  const session = await updateProductCopySessionStatus(sessionId, 'failed', error);
  if (activeSessionId === sessionId) activeSessionId = undefined;
  void recordActivityFailed({
    ...productCopyLogBase(session),
    title: '淘宝商品采集失败',
    error: { message: error },
  });
  emitProductCopyEvent('productCopy:failed', {
    url: session.url,
    error,
  });
  void startNextQueuedSession().catch(() => {});
  return session;
}

export function installProductCopyTabCleanup(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    const sessionId = sessionIdByTabId.get(tabId);
    if (!sessionId) return;
    sessionIdByTabId.delete(tabId);
    const session = sessions.get(sessionId);
    if (!session || isTerminalSession(session)) return;
    if (activeSessionId === sessionId) activeSessionId = undefined;
    const next: ProductCopySession = {
      ...session,
      tabId: undefined,
      status: 'failed',
      lastError: '淘宝商品工作页已关闭，无法继续采集商品',
      updatedAt: now(),
    };
    sessions.set(sessionId, next);
    void recordActivityFailed({
      ...productCopyLogBase(next),
      title: '淘宝商品采集失败',
      error: { message: next.lastError || '淘宝商品工作页已关闭' },
    });
    emitProductCopyEvent('productCopy:failed', {
      url: session.url,
      error: next.lastError,
    });
    void startNextQueuedSession().catch(() => {});
  });
}

export const productCopyRecordStore = {
  list: listProductCopyRecords,
  remove: removeProductCopyRecord,
};
