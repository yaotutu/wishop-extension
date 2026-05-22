import type { PurchaseLookupSession, ShippingSession, TaobaoRefundSession, TaobaoWorkspaceRole } from '../../../shared/types';
import { extensionApi } from '../../../shared/extension-api';

const SESSION_RETRY_COUNT = 10;
const SESSION_RETRY_DELAY_MS = 200;

async function waitForSession<T>(loader: () => Promise<T | null>): Promise<T | null> {
  /**
   * chrome.tabs.create resolves as soon as the tab exists, while the page may
   * start executing the content script almost immediately. A short retry keeps
   * toolbars reliable if the content script asks for its session before the
   * background service has finished binding tabId -> sessionId.
   */
  for (let attempt = 0; attempt < SESSION_RETRY_COUNT; attempt++) {
    const session = await loader();
    if (session) return session;
    await new Promise(resolve => setTimeout(resolve, SESSION_RETRY_DELAY_MS));
  }
  return null;
}

export interface TaobaoContentSessions {
  shippingSession: ShippingSession | null;
  purchaseLookupSession: PurchaseLookupSession | null;
  taobaoRefundSession: TaobaoRefundSession | null;
  workspaceRole: TaobaoWorkspaceRole | null;
}

export async function resolveTaobaoContentSessions(): Promise<TaobaoContentSessions> {
  const [shippingSession, purchaseLookupSession, taobaoRefundSession, workspaceRole] = await Promise.all([
    waitForSession(() => extensionApi.shipping.getCurrentTabSession()),
    waitForSession(() => extensionApi.purchaseLookup.getCurrentTabSession()),
    waitForSession(() => extensionApi.taobaoRefund.getCurrentTabSession()),
    extensionApi.taobaoWorkspace.getCurrentRole().catch(() => null),
  ]);
  return { shippingSession, purchaseLookupSession, taobaoRefundSession, workspaceRole };
}
