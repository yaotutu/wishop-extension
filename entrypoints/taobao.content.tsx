import { installCheckoutAddressFrameBridge, isTaobaoAddressFramePage } from '../src/content/taobao/adapters/checkout-address-adapter';
import { detectTaobaoLoginState } from '../src/content/taobao/adapters/login-state-adapter';
import { mountTaobaoToolbar } from '../src/content/taobao/runtime/mount-toolbar';
import { runProductCopyWorkflow } from '../src/content/taobao/runtime/product-copy-workflow';
import { resolveTaobaoContentSessions } from '../src/content/taobao/runtime/session-resolver';
import { extensionApi } from '../src/shared/extension-api';

export default defineContentScript({
  matches: ['https://*.taobao.com/*', 'https://*.tmall.com/*'],
  allFrames: true,
  runAt: 'document_idle',

  async main(ctx) {
    if (isTaobaoAddressFramePage()) {
      installCheckoutAddressFrameBridge();
      return;
    }
    if (window.top !== window) return;

    // 尽早把当前页的登录态回报给后台，作为后台全局登录态的事实输入。
    // 任何淘宝页导航后（工作页、心跳探测页、用户手动浏览）都会触发，
    // 让后台无需自己访问 DOM 就能掌握登录态。失败不影响后续工作流。
    reportLoginStateToBackground();

    const {
      shippingSession,
      purchaseLookupSession,
      taobaoRefundSession,
      productCopySession,
      workspaceRole,
    } = await resolveTaobaoContentSessions();
    if (productCopySession) {
      await runProductCopyWorkflow(productCopySession);
    }
    if (!shippingSession && !purchaseLookupSession && !taobaoRefundSession && !workspaceRole) return;
    await mountTaobaoToolbar(ctx, {
      shippingSession,
      purchaseLookupSession,
      taobaoRefundSession,
      workspaceRole,
    });
  },
});

/**
 * 探测当前页登录态并回报后台。异步且容错：任何异常都静默吞掉，
 * 登录态丢失只是少了观测数据，不应阻断 content script 主流程。
 */
function reportLoginStateToBackground(): void {
  try {
    const probe = detectTaobaoLoginState();
    void extensionApi.taobaoLogin.reportFromContent({
      state: probe.state,
      // source 会被后台强制覆盖为 'content-report'，这里仅占位。
      source: 'content-report',
      detectedAt: Date.now(),
      signals: probe.signals,
      reason: probe.reason,
      pageType: probe.pageType,
      url: probe.url,
    }).catch(() => {
      // 后台未就绪或连接失败，忽略。
    });
  } catch {
    // 探测异常不影响主流程。
  }
}
