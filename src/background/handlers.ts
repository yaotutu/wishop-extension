/**
 * 后台 IPC 总入口。
 *
 * 把所有「复制商品」业务域的 channel 统一接入 chrome.runtime.onMessage。
 * 业务实现全部由 runtime router 调度；这里只负责把消息分发到 router。
 */
import { createBackgroundRouter } from './router/create-background-router';
import { getProductCopySessionByTab } from './services/product-copy-session-service';

type RuntimeRequest = {
  channel: string;
  args: unknown[];
};

const runtimeRouter = createBackgroundRouter({
  getCurrentTabProductCopySession,
});

async function getCurrentTabProductCopySession(
  sender?: chrome.runtime.MessageSender,
): Promise<unknown> {
  if (sender?.tab?.id !== undefined) {
    return getProductCopySessionByTab(sender.tab.id);
  }
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (tabId === undefined) return null;
  return getProductCopySessionByTab(tabId);
}

async function handleMessage(
  channel: string,
  args: unknown[],
  sender?: chrome.runtime.MessageSender,
): Promise<unknown> {
  const routedHandler = runtimeRouter.resolve(channel);
  if (routedHandler) return routedHandler(args, sender);
  throw new Error(`Unknown runtime channel: ${channel}`);
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
