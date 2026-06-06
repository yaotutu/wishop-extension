import { installCheckoutAddressFrameBridge, isTaobaoAddressFramePage } from '../src/content/taobao/adapters/checkout-address-adapter';
import { mountTaobaoToolbar } from '../src/content/taobao/runtime/mount-toolbar';
import { runProductCopyWorkflow } from '../src/content/taobao/runtime/product-copy-workflow';
import { resolveTaobaoContentSessions } from '../src/content/taobao/runtime/session-resolver';

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
