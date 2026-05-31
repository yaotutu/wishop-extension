import { v4 as uuidv4 } from 'uuid';
import type {
  CollectedProductListing,
  CreateProductListingCollectionSessionInput,
  ProductListingCollectionSession,
  ProductListingCollectionSessionStatus,
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
  listCollectedProductListings,
  removeCollectedProductListing,
  saveCollectedProductListing,
} from '../store/collected-product-listing-repository.ts';
import { activateTaobaoWorkTab, openTaobaoWorkTab } from '../taobao-workspace/work-tab-service.ts';

const SESSION_TTL_MS = 30 * 60 * 1000;
const sessions = new Map<string, ProductListingCollectionSession>();
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
  return url.toString();
}

function emitProductListingCollectionEvent(event: string, payload: unknown): void {
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

function getFreshSession(sessionId: string): ProductListingCollectionSession | undefined {
  pruneExpiredSessions();
  return sessions.get(sessionId);
}

function isTerminalSession(session: ProductListingCollectionSession): boolean {
  return session.status === 'completed' || session.status === 'failed';
}

function hasActiveCollectionSession(): boolean {
  if (!activeSessionId) return false;
  const active = getFreshSession(activeSessionId);
  if (active && !isTerminalSession(active)) return true;
  activeSessionId = undefined;
  return false;
}

function collectionLogBase(session: ProductListingCollectionSession) {
  return {
    domain: 'listing' as const,
    scope: 'global' as const,
    trigger: 'background' as const,
    runId: session.id,
    metadata: {
      url: session.url,
      source: 'productListingCollection',
    },
  };
}

function missingFields(snapshot: TaobaoProductSnapshot): string[] {
  const missing: string[] = [];
  if (!snapshot.title) missing.push('title');
  if (snapshot.mainImages.length === 0) missing.push('mainImages');
  if (snapshot.detailImages.length === 0) missing.push('detailImages');
  if (snapshot.skuMatrix.length === 0) missing.push('skuMatrix');
  if (snapshot.productParams.length === 0) missing.push('productParams');
  return missing;
}

function toCollectedListing(snapshot: TaobaoProductSnapshot, existing?: CollectedProductListing | null): CollectedProductListing {
  const timestamp = now();
  return {
    ...snapshot,
    id: `${snapshot.platform}:${snapshot.itemId}`,
    sourceUrl: snapshot.url,
    missingFields: missingFields(snapshot),
    updatedAt: timestamp,
    collectedAt: snapshot.collectedAt || existing?.collectedAt || timestamp,
  };
}

async function startCollectionSession(sessionId: string): Promise<ProductListingCollectionSession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('商品采集会话已过期，请重新采集');
  activeSessionId = sessionId;
  try {
    const tab = await openTaobaoWorkTab(session.url);
    if (!tab.id) throw new Error('无法创建淘宝商品工作页');
    return bindProductListingCollectionSessionToTab(session.id, tab.id);
  } catch (error) {
    activeSessionId = undefined;
    const message = error instanceof Error ? error.message : '打开淘宝商品工作页失败';
    await failProductListingCollectionSession(sessionId, message);
    throw error;
  }
}

async function startNextQueuedSession(): Promise<void> {
  if (startingNextSession || hasActiveCollectionSession()) return;
  startingNextSession = true;
  try {
    while (!hasActiveCollectionSession() && queuedSessionIds.length > 0) {
      const sessionId = queuedSessionIds.shift();
      if (!sessionId) continue;
      const session = getFreshSession(sessionId);
      if (!session || isTerminalSession(session)) continue;
      try {
        await startCollectionSession(sessionId);
      } catch {
        // 单个采集任务失败后继续处理队列，失败事件由 fail 方法负责通知 UI。
      }
    }
  } finally {
    startingNextSession = false;
  }
}

export async function openProductListingCollectionSession(
  input: CreateProductListingCollectionSessionInput,
): Promise<ProductListingCollectionSession> {
  const url = normalizeTaobaoProductUrl(input.url);
  pruneExpiredSessions();
  const existing = Array.from(sessions.values()).find(session => !isTerminalSession(session) && session.url === url);
  if (existing) return existing;

  const timestamp = now();
  const session: ProductListingCollectionSession = {
    id: uuidv4(),
    url,
    status: 'created',
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: timestamp + SESSION_TTL_MS,
  };
  sessions.set(session.id, session);
  void recordActivityStarted({
    ...collectionLogBase(session),
    title: '淘宝商品采集任务已创建',
    detail: `商品链接：${url}`,
  });

  if (hasActiveCollectionSession()) {
    const queued: ProductListingCollectionSession = { ...session, status: 'queued', updatedAt: now() };
    sessions.set(session.id, queued);
    queuedSessionIds.push(session.id);
    void recordActivityQueued({
      ...collectionLogBase(queued),
      title: '淘宝商品采集已排队',
      detail: '淘宝工作页正在处理其他任务，当前商品会自动排队采集。',
    });
    return queued;
  }
  return startCollectionSession(session.id);
}

export async function bindProductListingCollectionSessionToTab(
  sessionId: string,
  tabId: number,
): Promise<ProductListingCollectionSession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('商品采集会话已过期，请重新采集');
  const next = { ...session, tabId, status: 'opened' as const, updatedAt: now() };
  sessions.set(sessionId, next);
  sessionIdByTabId.set(tabId, sessionId);
  return next;
}

export async function getProductListingCollectionSessionByTab(tabId: number): Promise<ProductListingCollectionSession | null> {
  const sessionId = sessionIdByTabId.get(tabId);
  if (!sessionId) return null;
  return getFreshSession(sessionId) || null;
}

export async function updateProductListingCollectionSessionStatus(
  sessionId: string,
  status: ProductListingCollectionSessionStatus,
  lastError?: string,
): Promise<ProductListingCollectionSession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('商品采集会话已过期，请重新采集');
  const next = { ...session, status, lastError, updatedAt: now() };
  sessions.set(sessionId, next);
  return next;
}

export async function reportProductListingCollectionChallenge(
  sessionId: string,
  snapshot: TaobaoSecurityChallengeSnapshot,
): Promise<ProductListingCollectionSession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('商品采集会话已过期，请重新采集');
  const next: ProductListingCollectionSession = {
    ...session,
    status: 'waiting-user-verification',
    challenge: snapshot,
    lastError: snapshot.reason || '淘宝商品页需要用户处理验证',
    updatedAt: now(),
  };
  sessions.set(sessionId, next);
  void recordActivityWaitingUser({
    ...collectionLogBase(next),
    title: '淘宝商品采集需要用户处理验证',
    detail: next.lastError,
    notification: {
      topic: 'taobao.security_challenge',
      urgency: 'important',
    },
  });
  emitProductListingCollectionEvent('productListingCollection:challenge', {
    url: next.url,
    reason: next.lastError,
  });
  await activateTaobaoWorkTab();
  return next;
}

export async function resolveProductListingCollectionChallenge(sessionId: string): Promise<ProductListingCollectionSession> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('商品采集会话已过期，请重新采集');
  const next: ProductListingCollectionSession = {
    ...session,
    status: 'page-ready',
    challenge: undefined,
    lastError: undefined,
    updatedAt: now(),
  };
  sessions.set(sessionId, next);
  return next;
}

export async function completeProductListingCollectionSession(
  sessionId: string,
  snapshot: TaobaoProductSnapshot,
): Promise<CollectedProductListing> {
  const session = getFreshSession(sessionId);
  if (!session) throw new Error('商品采集会话已过期，请重新采集');
  const listing = await saveCollectedProductListing(toCollectedListing(snapshot));
  const next = {
    ...session,
    status: 'completed' as const,
    listingId: listing.id,
    challenge: undefined,
    updatedAt: now(),
  };
  sessions.set(sessionId, next);
  if (activeSessionId === sessionId) activeSessionId = undefined;
  void recordActivityCompleted({
    ...collectionLogBase(next),
    title: '淘宝商品采集完成',
    detail: `${listing.title || listing.itemId}，SKU ${listing.skuMatrix.length} 个，参数 ${listing.productParams.length} 项`,
  });
  emitProductListingCollectionEvent('productListingCollection:completed', listing);
  void startNextQueuedSession().catch(() => {});
  return listing;
}

export async function failProductListingCollectionSession(
  sessionId: string,
  error: string,
): Promise<ProductListingCollectionSession> {
  const session = await updateProductListingCollectionSessionStatus(sessionId, 'failed', error);
  if (activeSessionId === sessionId) activeSessionId = undefined;
  void recordActivityFailed({
    ...collectionLogBase(session),
    title: '淘宝商品采集失败',
    error: { message: error },
  });
  emitProductListingCollectionEvent('productListingCollection:failed', {
    url: session.url,
    error,
  });
  void startNextQueuedSession().catch(() => {});
  return session;
}

export function installProductListingCollectionTabCleanup(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    const sessionId = sessionIdByTabId.get(tabId);
    if (!sessionId) return;
    sessionIdByTabId.delete(tabId);
    const session = sessions.get(sessionId);
    if (!session || isTerminalSession(session)) return;
    if (activeSessionId === sessionId) activeSessionId = undefined;
    const next: ProductListingCollectionSession = {
      ...session,
      tabId: undefined,
      status: 'failed',
      lastError: '淘宝商品工作页已关闭，无法继续采集商品',
      updatedAt: now(),
    };
    sessions.set(sessionId, next);
    void recordActivityFailed({
      ...collectionLogBase(next),
      title: '淘宝商品采集失败',
      error: { message: next.lastError || '淘宝商品工作页已关闭' },
    });
    emitProductListingCollectionEvent('productListingCollection:failed', {
      url: session.url,
      error: next.lastError,
    });
    void startNextQueuedSession().catch(() => {});
  });
}

export const productListingCollectionStore = {
  list: listCollectedProductListings,
  remove: removeCollectedProductListing,
};
