import type { TaobaoLoginState, TaobaoPageType } from '../../../shared/types';
import { normalizeText } from '../dom/text.ts';
import { detectLoginHostRedirect, detectLoginPopupWidget } from '../dom/login-detector.ts';

/**
 * 淘宝登录态探测器。
 *
 * 判定规则基于真实 DOM 实测（4 类页面 × 2 种登录态，共 8 组数据），
 * 采用「未登录反向信号 + 已登录正向信号」双向交叉判定。
 *
 * 关键实测结论（写在这里作为后续维护依据）：
 *
 * 1. 首页（www.taobao.com）未登录 = 页内弹窗（host 不变）：
 *    出现 .J_MIDDLEWARE_FRAME_WIDGET（position:fixed, z-index:2147483647 全屏遮罩）
 *    + 内嵌 iframe.src 含 login.taobao.com/member/login.jhtml（典型 420×320）。
 *
 * 2. 干活页（buyertrade / 订单详情 / 商品详情）未登录 = 整页跳转登录域：
 *    location.host 变成 login.taobao.com / login.tmall.com / passport.taobao.com，
 *    原页 DOM 根本不渲染，因此首页那套弹窗信号在干活页永远不会出现。
 *
 * 3. 全站通用的已登录正向信号 = .site-nav-login-info-nick 存在且可见且文本为真实昵称
 *    （未登录时该元素直接消失，不是变成"亲，请登录"）。
 *
 * 4. 必须避开的陷阱：
 *    - "亲，请登录" / .site-nav-login .h 链接：登录后仍在，假阴性陷阱，不能当登出信号。
 *    - cookie 存在性（_tb_token_ / tracknick 等）：未登录弹窗页仍存在，不可靠。
 *    - 首页 .member-nick / .login-guide-desc：假占位昵称，未登录也有。
 *
 * 底层的 host 跳转 / 页内弹窗探测在 dom/login-detector.ts，与本文件解耦，
 * security-challenge-adapter 也复用同一份，避免重复实现与互相依赖。
 *
 * 遵循 AGENTS.md adapter 规则：只读 DOM，不调 IPC，不存数据，不渲染 UI。
 */

/** 登录态探测器的原始判定结果（不含 source/detectedAt，由调用方填充）。 */
export interface TaobaoLoginProbeResult {
  state: TaobaoLoginState;
  /** 命中的判定信号列表（便于调试，例如 ['host:login.taobao.com', 'text:请登录']）。 */
  signals: string[];
  /** 未登录时的可读原因。 */
  reason?: string;
  /** 探测时识别到的页面类型。 */
  pageType: TaobaoPageType;
  /** 探测时所在页面 URL（仅 host + path，不含 query，避免泄露敏感参数）。 */
  url: string;
}

// 全站通用的已登录昵称锚点。实测在首页 / 已买到宝贝 / 订单详情 / 商品详情 四类页面都存在且 class 无 hash。
const LOGGED_IN_NICK_SELECTOR = '.site-nav-login-info-nick';

/**
 * 识别当前淘宝/天猫页面的类型。用于判定规则按页面类型分支。
 */
export function detectTaobaoPageType(href: string = location.href, host: string = location.host): TaobaoPageType {
  if (/login\.(taobao|tmall)\.com|passport\.taobao\.com/.test(host)) return 'other';
  if (/buyertrade\.taobao\.com/.test(host)) return 'bought-list';
  if (/trade\.taobao\.com\/trade\/detail|trade\.tmall\.com\/detail/.test(href)) return 'order-detail';
  if (/item\.taobao\.com|detail\.tmall\.com/.test(host)) return 'product-detail';
  if (/buy\.taobao\.com|buy\.tmall\.com|cart\.taobao\.com|cart\.tmall\.com/.test(host)) return 'checkout';
  if (/^www\.taobao\.com$/.test(host)) return 'home';
  return 'other';
}

/** 返回去掉 query 的 URL（仅 host + path），避免日志泄露敏感参数。 */
function sanitizedUrl(href: string = location.href): string {
  const queryIndex = href.indexOf('?');
  return queryIndex >= 0 ? href.slice(0, queryIndex) : href;
}

/**
 * 正向信号：全站通用的已登录昵称锚点。
 * 实测：.site-nav-login-info-nick 在已登录态四类页面都可见且文本为真实昵称；
 * 未登录时该元素直接消失（不是变成"亲，请登录"）。
 */
function detectLoggedInNick(): { matched: boolean; signal?: string } {
  const nickEl = document.querySelector(LOGGED_IN_NICK_SELECTOR);
  if (!nickEl) return { matched: false };
  const rect = nickEl.getBoundingClientRect();
  if (rect.height <= 0) return { matched: false };
  const text = normalizeText(nickEl.textContent || '');
  // 文本必须非空，且不能是登录引导文案（防御性，虽然实测未登录时元素会消失）。
  if (!text || text.includes('登录')) return { matched: false };
  return { matched: true, signal: `nick:${LOGGED_IN_NICK_SELECTOR}` };
}

/**
 * 检测当前淘宝/天猫页面的登录态。纯只读 DOM 操作。
 *
 * 判定优先级：
 *   1. 反向信号 A（登录域 host）→ 未登录（高置信，覆盖干活页）
 *   2. 反向信号 B（页内登录弹窗）→ 未登录（高置信，覆盖首页）
 *   3. 正向信号（昵称锚点）→ 已登录（高置信，全站通用）
 *   4. 都不命中 → unknown（不瞎猜，由调用方决定复核/等待）
 */
export function detectTaobaoLoginState(): TaobaoLoginProbeResult {
  const url = sanitizedUrl();
  const pageType = detectTaobaoPageType();

  // 反向信号优先：它们是未登录的充分条件，存在即覆盖正向信号。
  const hostRedirect = detectLoginHostRedirect();
  if (hostRedirect.matched) {
    return {
      state: 'logged-out',
      signals: [hostRedirect.signal!],
      reason: hostRedirect.reason,
      pageType,
      url,
    };
  }

  const popup = detectLoginPopupWidget();
  if (popup.matched) {
    return {
      state: 'logged-out',
      signals: [popup.signal!],
      reason: popup.reason,
      pageType,
      url,
    };
  }

  // 反向信号缺失时，看正向信号。
  const nick = detectLoggedInNick();
  if (nick.matched) {
    return {
      state: 'logged-in',
      signals: [nick.signal!],
      pageType,
      url,
    };
  }

  // 都不命中：可能是页面还在加载、中间态，或淘宝改版导致信号失效。不瞎猜。
  return {
    state: 'unknown',
    signals: [],
    reason: '未能判定登录态（页面可能仍在加载，或检测信号需要更新）',
    pageType,
    url,
  };
}
