import type { TaobaoLoginSnapshot, TaobaoLoginSource, TaobaoLoginState } from '../../shared/types';
import { recordActivityWaitingUser } from '../activity-logs/activity-log-service.ts';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';
import { activateTaobaoWorkTab, ensureTaobaoTaskWorkTab } from '../taobao-workspace/work-tab-service.ts';
import { hasActiveProductCopySession } from '../services/product-copy-session-service.ts';

/**
 * 淘宝登录态服务：后台内存态登录态的唯一事实来源。
 *
 * 登录态是观察数据，不持久化（按 AGENTS.md，观察数据不应作为持久业务状态来源）。
 * Service worker 重启后回到 unknown，首次操作或心跳会即时探测补上。
 *
 * 三条更新路径汇聚到 applyTaobaoLoginReport：
 *   1. content 主动回报（taobao.content.tsx 导航后调用 detectTaobaoLoginState → reportFromContent）
 *   2. 定时心跳（scheduler 的 taobaoLogin.checkHeartbeat executor → probeTaobaoLoginNow）
 *   3. 操作前即时探测（各淘宝操作入口的 requireTaobaoLoggedIn gate）
 *
 * 状态变化时广播 taobaoLogin:changed 事件，让前端 Header 指示器和未登录 Modal 更新。
 */
const logger = createDiagnosticLogger({ domain: 'system', component: 'taobao-login-service' });

/** 事件名：登录态变化时广播，前端订阅后更新指示器/弹 Modal。 */
export const TAOBAO_LOGIN_CHANGED_EVENT = 'taobaoLogin:changed';

/** 未登录通知的最小间隔，避免心跳反复探测到未登录时刷屏（毫秒）。 */
const LOGIN_REQUIRED_NOTIFY_THROTTLE_MS = 10 * 60 * 1000;

/** 即时探测时，等待 content 回报的超时时间（毫秒）。 */
const PROBE_WAIT_TIMEOUT_MS = 8000;

/** 即时探测导航的目标页：已买到宝贝页未登录会整页跳转到登录域，是干净的探测页。 */
const PROBE_URL = 'https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm';

// 内存态：当前登录态快照。SW 重启后重置为 unknown。
let currentSnapshot: TaobaoLoginSnapshot = {
  state: 'unknown',
  source: 'content-report',
  detectedAt: 0,
  signals: [],
  reason: '尚无登录态数据',
};

// 进行中的探测 Promise。并发调用 probeTaobaoLoginNow 直接复用它，避免重复导航工作页。
let inFlightProbe: Promise<TaobaoLoginSnapshot> | null = null;

// 等待 content 回报来解除的探测 resolver（单一）。只有 inFlightProbe 进行中时才非空。
let pendingProbeResolve: ((snapshot: TaobaoLoginSnapshot) => void) | null = null;

// 上次发"未登录"通知的时间，用于 throttle。
let lastLoginRequiredNotifyAt = 0;

/** 返回当前登录态快照（后台内存态唯一事实来源）。 */
export function getTaobaoLoginSnapshot(): TaobaoLoginSnapshot {
  return currentSnapshot;
}

/** 广播登录态变化事件，通知前端刷新指示器/弹 Modal。 */
function emitLoginChangedEvent(snapshot: TaobaoLoginSnapshot): void {
  chrome.runtime
    .sendMessage({ type: 'event', event: TAOBAO_LOGIN_CHANGED_EVENT, payload: snapshot })
    .catch(() => {
      // 接收方可能未就绪（如刚打开的页面），忽略广播失败。
    });
}

/** 写一条"未登录，需用户处理"的活动日志 + 通知。带 throttle，避免刷屏。 */
async function maybeNotifyLoginRequired(snapshot: TaobaoLoginSnapshot): Promise<void> {
  const now = Date.now();
  if (now - lastLoginRequiredNotifyAt < LOGIN_REQUIRED_NOTIFY_THROTTLE_MS) {
    logger.warn('检测到未登录，但距上次通知不足阈值，跳过本次通知', { throttleMs: LOGIN_REQUIRED_NOTIFY_THROTTLE_MS });
    return;
  }
  lastLoginRequiredNotifyAt = now;
  await recordActivityWaitingUser({
    domain: 'system',
    scope: 'global',
    title: '淘宝未登录，部分功能不可用',
    detail: snapshot.reason || '检测到淘宝/天猫未登录，请先登录后再执行订单读取、发货、退款等操作。',
    notification: { topic: 'taobao.login_required', urgency: 'important' },
    metadata: { source: snapshot.source, signals: snapshot.signals.join('|') },
  });
}

/**
 * 应用一次登录态回报。这是所有更新路径的汇聚点。
 *
 * 状态发生变化（或从 unknown 首次确定）时：
 *   - 广播 taobaoLogin:changed 事件
 *   - 若变为 logged-out，写"未登录"活动日志 + 通知（throttle）
 *   - 若有探测在等待，解除其等待
 */
export async function applyTaobaoLoginReport(
  snapshot: TaobaoLoginSnapshot,
  options: { silent?: boolean } = {},
): Promise<void> {
  const previousState = currentSnapshot.state;
  // 合并：始终采纳最新探测结果（探测时间更靠后的为权威）。
  currentSnapshot = snapshot;

  logger.info('登录态回报', {
    previous: previousState,
    current: snapshot.state,
    source: snapshot.source,
    signals: snapshot.signals,
  });

  // 若有探测在等待 content 回报，用这次回报解除它（清空后再 resolve，避免重复解除）。
  if (pendingProbeResolve) {
    const resolve = pendingProbeResolve;
    pendingProbeResolve = null;
    resolve(snapshot);
  }

  if (options.silent) return;

  // 状态变化时才广播，减少噪音。
  if (previousState !== snapshot.state) {
    emitLoginChangedEvent(snapshot);
    if (snapshot.state === 'logged-out') {
      await maybeNotifyLoginRequired(snapshot);
    }
  }
}

/** 构造一个登录态快照（供 content 回报和探测结果统一格式）。 */
export function buildTaobaoLoginSnapshot(params: {
  state: TaobaoLoginState;
  source: TaobaoLoginSource;
  signals: string[];
  reason?: string;
  pageType?: TaobaoLoginSnapshot['pageType'];
  url?: string;
}): TaobaoLoginSnapshot {
  return {
    state: params.state,
    source: params.source,
    detectedAt: Date.now(),
    signals: params.signals,
    reason: params.reason,
    pageType: params.pageType,
    url: params.url,
  };
}

/**
 * 检查是否有淘宝读取任务正在使用 background-task 工作页。
 *
 * purchase-lookup / product-copy / refund 都复用同一个 background-task 工作页。
 * 若其中任何一个正在跑，探测导航会打断它（content script 读 DOM 读到一半被导航走）。
 * 心跳探测前应让位，等任务跑完再探测。
 */
function hasActiveTaobaoReadSession(): boolean {
  return hasActiveProductCopySession();
}

/**
 * 触发一次即时登录态探测。
 *
 * 流程：导航 background-task 工作页到探测页（buyertrade，未登录会整页跳转登录域），
 * content script 导航后会主动回报 → applyTaobaoLoginReport 解除本函数的等待。
 * 超时则保持上次状态（不瞎猜）。
 *
 * 并发去重：若已有探测在进行，直接复用其 Promise，不重复导航。
 * 心跳让位：source 为 'heartbeat' 且有活跃读取任务时，跳过本轮探测，避免打断任务。
 */
export async function probeTaobaoLoginNow(source: TaobaoLoginSource = 'pre-action-probe'): Promise<TaobaoLoginSnapshot> {
  // 心跳让位：后台读取任务正在用 background-task 工作页时，导航会打断它。
  if (source === 'heartbeat' && hasActiveTaobaoReadSession()) {
    logger.info('心跳探测让位：有淘宝读取任务正在进行，跳过本轮探测');
    return buildTaobaoLoginSnapshot({
      state: currentSnapshot.state,
      source,
      signals: currentSnapshot.signals,
      reason: '有淘宝读取任务正在进行，心跳探测已让位',
      pageType: currentSnapshot.pageType,
      url: currentSnapshot.url,
    });
  }

  // 并发去重：复用进行中的探测，避免重复导航。
  if (inFlightProbe) {
    logger.info('已有探测在进行，复用该探测结果');
    return inFlightProbe;
  }

  inFlightProbe = runProbe(source).finally(() => {
    inFlightProbe = null;
  });
  return inFlightProbe;
}

/**
 * 实际执行一次探测：导航工作页 → 等 content 回报（或超时）。
 * 仅由 probeTaobaoLoginNow 调用，外部统一走去重入口。
 */
function runProbe(source: TaobaoLoginSource): Promise<TaobaoLoginSnapshot> {
  return new Promise<TaobaoLoginSnapshot>(resolve => {
    const timer = setTimeout(() => {
      // 超时：清理 resolver，保持上次状态，返回当前快照。
      if (pendingProbeResolve === resolveProbe) pendingProbeResolve = null;
      logger.warn('即时探测超时，保持上次登录态', { timeoutMs: PROBE_WAIT_TIMEOUT_MS, lastState: currentSnapshot.state });
      resolve(currentSnapshot);
    }, PROBE_WAIT_TIMEOUT_MS);

    const resolveProbe = (snapshot: TaobaoLoginSnapshot) => {
      clearTimeout(timer);
      resolve(snapshot);
    };
    pendingProbeResolve = resolveProbe;

    // 导航探测页。content script 在导航完成后会调用 detectTaobaoLoginState 并通过
    // reportFromContent → applyTaobaoLoginReport 解除上面的等待。
    ensureTaobaoTaskWorkTab()
      .then(async tab => {
        if (!tab.id) {
          logger.error('无法创建/复用淘宝工作页，探测失败');
          clearTimeout(timer);
          if (pendingProbeResolve === resolveProbe) pendingProbeResolve = null;
          const fallback = buildTaobaoLoginSnapshot({
            state: 'unknown',
            source,
            signals: [],
            reason: '无法打开淘宝工作页进行登录态探测',
          });
          currentSnapshot = fallback;
          resolve(fallback);
          return;
        }
        // 导航到探测页。即使是同一个 tab，update url 也会触发重新加载 + content script 回报。
        await chrome.tabs.update(tab.id, { url: PROBE_URL });
        logger.info('已导航淘宝工作页进行登录态探测', { tabId: tab.id, probeUrl: PROBE_URL });
      })
      .catch(error => {
        logger.error('导航淘宝工作页失败', error);
        clearTimeout(timer);
        if (pendingProbeResolve === resolveProbe) pendingProbeResolve = null;
        const fallback = buildTaobaoLoginSnapshot({
          state: 'unknown',
          source,
          signals: [],
          reason: '导航淘宝工作页失败，无法探测登录态',
        });
        currentSnapshot = fallback;
        resolve(fallback);
      });
  });
}

/**
 * 打开淘宝登录页供用户登录。
 *
 * 用户在前端"去登录"按钮触发：复用 background-task 工作页，导航到探测页（buyertrade），
 * 未登录会被淘宝重定向到登录域，然后把工作页激活到前台让用户完成登录。
 * 登录完成后 content script 会回报新的登录态，前端指示器自动刷新。
 */
export async function openTaobaoLoginPage(): Promise<void> {
  try {
    const tab = await ensureTaobaoTaskWorkTab();
    if (tab.id) {
      await chrome.tabs.update(tab.id, { url: PROBE_URL, active: true });
    }
    // 激活到前台（ensureTaobaoTaskWorkTab 用的是 inactive，这里要用户可见）。
    await activateTaobaoWorkTab();
    logger.info('已打开淘宝登录页供用户登录');
  } catch (error) {
    logger.error('打开淘宝登录页失败', error);
    throw error;
  }
}

/**
 * 操作前置 gate：要求淘宝已登录，否则抛出 TaobaoLoginRequiredError。
 *
 * 供各淘宝操作入口（发货/采购单读取/退款/商品采集）在打开工作页前调用，
 * 实现硬拦截：未登录或无法确认登录时直接拒绝，避免打开 tab 后才发现失败、产生脏数据。
 *
 * - logged-out → 直接抛错
 * - unknown → 先即时探测一次
 *     · 探测后 logged-out → 抛错
 *     · 探测后仍 unknown（超时/工作页打不开）→ 仍抛错（gate 语义是"必须确认登录才放行"，
 *       无法确认时拦截比盲放行更安全，用户重试即可，操作本身会开工作页触发新回报）
 *     · 探测后 logged-in → 放行
 * - logged-in → 放行
 */
export async function requireTaobaoLoggedIn(): Promise<TaobaoLoginSnapshot> {
  if (currentSnapshot.state === 'logged-out') {
    throw new TaobaoLoginRequiredError(currentSnapshot);
  }
  if (currentSnapshot.state === 'unknown') {
    logger.info('登录态未知，触发即时探测');
    const probed = await probeTaobaoLoginNow('pre-action-probe');
    if (probed.state !== 'logged-in') {
      // 未登录或仍无法确认，都拦截。后者 reason 会说明是探测超时/失败。
      throw new TaobaoLoginRequiredError(probed);
    }
    return probed;
  }
  return currentSnapshot;
}

/**
 * 登录态校验失败错误。各操作入口捕获后透传给前端，前端弹 Modal 引导登录。
 * 携带快照便于前端展示具体原因。
 *
 * message 固定以 ERROR_TAG 开头：因为 invoke 经 handlers.ts 透传时会被序列化成
 * 纯字符串 message（Error 对象不保留），前端靠这个稳定前缀可靠识别登录拦截，
 * 而不是靠文案匹配（文案会随探测原因变化）。
 */
export const TAOBAO_LOGIN_REQUIRED_ERROR_TAG = '[taobao-login-required]';

export class TaobaoLoginRequiredError extends Error {
  readonly snapshot: TaobaoLoginSnapshot;
  readonly isTaobaoLoginRequired = true;
  constructor(snapshot: TaobaoLoginSnapshot) {
    super(`${TAOBAO_LOGIN_REQUIRED_ERROR_TAG} ${snapshot.reason || '检测到淘宝未登录，请先登录淘宝后再操作'}`);
    this.name = 'TaobaoLoginRequiredError';
    this.snapshot = snapshot;
  }
}

/** 类型守卫：判断一个错误是否为登录态拦截错误。供前端/调用方使用。 */
export function isTaobaoLoginRequiredError(error: unknown): boolean {
  if (error instanceof TaobaoLoginRequiredError) return true;
  if (typeof error === 'object' && error !== null && (error as { isTaobaoLoginRequired?: boolean }).isTaobaoLoginRequired === true) {
    return true;
  }
  // invoke 透传后 error 是普通 Error，靠 message 前缀识别。
  if (error instanceof Error) return error.message.startsWith(TAOBAO_LOGIN_REQUIRED_ERROR_TAG);
  if (typeof error === 'string') return error.startsWith(TAOBAO_LOGIN_REQUIRED_ERROR_TAG);
  return false;
}
