/**
 * 淘宝登录态底层 DOM 探测工具。
 *
 * 这里只放"从 DOM 判断登录态"的原子探测器，不包含业务判定流程。
 * login-state-adapter（专职登录态）和 security-challenge-adapter（综合验证/滑块/封禁）
 * 都从这里复用，避免两者互相依赖、避免重复查询同一批 DOM。
 *
 * 遵循 AGENTS.md：dom/ 只放通用页面读取工具，不调 IPC、不含业务流程。
 *
 * 判定依据全部来自真实 DOM 实测（4 类页面 × 2 种登录态）：
 * - 整页跳转：干活页未登录时 host 变成 login.taobao.com 等。
 * - 页内弹窗：首页未登录时出现 J_MIDDLEWARE_FRAME_WIDGET 遮罩 + login.jhtml iframe。
 */

/** 登录域 host 正则：命中即认为整页跳转到了登录页。 */
const LOGIN_HOST_PATTERN = /(^|\.)login\.(taobao|tmall)\.com$|^passport\.taobao\.com$/;

/** 首页登录弹窗容器 class。实测 z-index 固定为 2147483647。 */
const MIDDLEWARE_WIDGET_CLASS = 'J_MIDDLEWARE_FRAME_WIDGET';

/** 登录弹窗阈值：实测首页遮罩 z-index 为 2147483647，取略低值容忍淘宝微调。 */
const HIGH_ZINDEX_THRESHOLD = 2147483000;

/** 登录弹窗内嵌的登录表单 iframe 的 URL 片段。 */
const LOGIN_JHTML_FRAGMENT = 'login.taobao.com/member/login.jhtml';

export interface LoginDetectorHit {
  matched: boolean;
  /** 命中信号标识（如 'host:login.taobao.com'），便于日志/调试。 */
  signal?: string;
  /** 可读原因。 */
  reason?: string;
}

/** 元素是否可见（宽高都大于 0）。 */
function isVisible(el: Element | null): boolean {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * 反向信号 A：整页跳转到登录域。
 * 干活页（buyertrade / 订单详情 / 商品详情）未登录的主信号。
 */
export function detectLoginHostRedirect(host: string = location.host): LoginDetectorHit {
  if (LOGIN_HOST_PATTERN.test(host)) {
    return {
      matched: true,
      signal: `host:${host}`,
      reason: `页面已跳转到淘宝登录页（${host}），当前未登录`,
    };
  }
  return { matched: false };
}

/**
 * 反向信号 B：页内登录弹窗（遮罩 + login.jhtml iframe）。
 * 首页（www.taobao.com）未登录的主信号。
 */
export function detectLoginPopupWidget(): LoginDetectorHit {
  const widgets = Array.from(document.getElementsByClassName(MIDDLEWARE_WIDGET_CLASS));
  for (const widget of widgets) {
    const style = window.getComputedStyle(widget);
    const zIndex = Number.parseInt(style.zIndex || '0', 10);
    // 必须是固定定位且超高 z-index 的遮罩容器，排除同名但非登录态的误用。
    if (style.position !== 'fixed' || !Number.isFinite(zIndex) || zIndex < HIGH_ZINDEX_THRESHOLD) continue;
    // 遮罩内必须嵌一个指向 login.jhtml 的可见 iframe，才确认是登录弹窗。
    const loginIframe = Array.from(widget.querySelectorAll('iframe')).find(iframe =>
      (iframe.src || '').includes(LOGIN_JHTML_FRAGMENT),
    );
    if (loginIframe && isVisible(loginIframe)) {
      return {
        matched: true,
        signal: `popup:${MIDDLEWARE_WIDGET_CLASS}+login.jhtml`,
        reason: '页面弹出了淘宝登录弹窗，当前未登录',
      };
    }
  }
  return { matched: false };
}
