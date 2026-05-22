import { SessionManager } from './utils/session-manager';
import { getPurchaseLookupSessionByTab } from './purchase-lookup/purchase-lookup-session-service';
import { getShippingSessionByTab } from './shipping/shipping-session-service';
import { getTaobaoRefundSessionByTab } from './taobao-refund/taobao-refund-session-service';
import { createBackgroundRouter } from './router/create-background-router';
import type { ScanSessionState } from './services/violation-service';

type RuntimeRequest = {
  channel: string;
  args: unknown[];
};

const taskSessions = new SessionManager<void>();
const scanSessions = new SessionManager<ScanSessionState>();
const runtimeRouter = createBackgroundRouter({
  taskSessions,
  scanSessions,
  getCurrentTabShippingSession,
  getCurrentTabPurchaseLookupSession,
  getCurrentTabTaobaoRefundSession,
});

async function handleMessage(channel: string, args: unknown[], sender?: chrome.runtime.MessageSender): Promise<unknown> {
  const routedHandler = runtimeRouter.resolve(channel);
  if (routedHandler) return routedHandler(args, sender);

  throw new Error(`Unknown runtime channel: ${channel}`);
}

async function getCurrentTabShippingSession(sender?: chrome.runtime.MessageSender): Promise<unknown> {
  if (sender?.tab?.id !== undefined) {
    return getShippingSessionByTab(sender.tab.id);
  }
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (tabId === undefined) return null;
  return getShippingSessionByTab(tabId);
}

async function getCurrentTabPurchaseLookupSession(sender?: chrome.runtime.MessageSender): Promise<unknown> {
  if (sender?.tab?.id !== undefined) {
    return getPurchaseLookupSessionByTab(sender.tab.id);
  }
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (tabId === undefined) return null;
  return getPurchaseLookupSessionByTab(tabId);
}

async function getCurrentTabTaobaoRefundSession(sender?: chrome.runtime.MessageSender): Promise<unknown> {
  if (sender?.tab?.id !== undefined) {
    return getTaobaoRefundSessionByTab(sender.tab.id);
  }
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (tabId === undefined) return null;
  return getTaobaoRefundSessionByTab(tabId);
}

export function installRuntimeHandlers(): void {
  chrome.runtime.onMessage.addListener((request: RuntimeRequest, sender, sendResponse) => {
    if (!request?.channel) return false;
    handleMessage(request.channel, request.args || [], sender)
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  });
}
