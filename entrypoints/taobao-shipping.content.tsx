import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { extensionApi } from '../src/shared/extension-api';
import { ShippingToolbar } from '../src/content/taobao/ShippingToolbar';

const toolbarCss = `
  :host {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    z-index: 2147483647 !important;
    pointer-events: none !important;
  }
  .wishop-shipping-toolbar {
    box-sizing: border-box;
    position: fixed;
    top: 96px;
    left: 16px;
    z-index: 2147483647;
    width: 380px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
    overflow: auto;
    padding: 12px;
    border: 1px solid rgba(22, 119, 255, 0.22);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
    color: #1f1f1f;
    font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    pointer-events: auto;
  }
  .wishop-shipping-toolbar * {
    box-sizing: border-box;
  }
  .wishop-shipping-toolbar--collapsed {
    width: auto;
    min-width: 0;
    padding: 0;
    overflow: visible;
    border-color: #1677ff;
  }
  .wishop-shipping-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }
  .wishop-shipping-title {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .wishop-shipping-header strong {
    font-size: 14px;
    line-height: 20px;
  }
  .wishop-shipping-status {
    color: #1677ff;
    font-size: 12px;
  }
  .wishop-shipping-icon-button {
    width: 28px;
    height: 28px;
    border: 1px solid #d9d9d9;
    border-radius: 4px;
    background: #fff;
    color: #595959;
    cursor: pointer;
    flex: 0 0 auto;
  }
  .wishop-shipping-icon-button:hover {
    border-color: #1677ff;
    color: #1677ff;
  }
  .wishop-shipping-collapsed-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 12px;
    border: 0;
    border-radius: 6px;
    background: #1677ff;
    color: #fff;
    box-shadow: 0 10px 24px rgba(22, 119, 255, 0.28);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .wishop-shipping-grid {
    display: grid;
    gap: 8px;
  }
  .wishop-shipping-card {
    min-width: 0;
    padding: 8px;
    border: 1px solid #f0f0f0;
    border-radius: 6px;
    background: #fafafa;
  }
  .wishop-shipping-grid label {
    display: block;
    color: #8c8c8c;
    font-size: 12px;
  }
  .wishop-shipping-grid p {
    margin: 2px 0;
    display: -webkit-box;
    max-height: 60px;
    overflow: hidden;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    font-weight: 600;
    line-height: 20px;
  }
  .wishop-shipping-grid small {
    display: block;
    color: #595959;
    overflow-wrap: anywhere;
    line-height: 18px;
  }
  .wishop-shipping-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }
  .wishop-shipping-actions button {
    height: 28px;
    padding: 0 10px;
    border: 1px solid #d9d9d9;
    border-radius: 4px;
    background: #fff;
    color: #1f1f1f;
    cursor: pointer;
    white-space: nowrap;
  }
  .wishop-shipping-actions button:hover {
    border-color: #1677ff;
    color: #1677ff;
  }
  .wishop-shipping-notice {
    margin-top: 8px;
    color: #389e0d;
    font-size: 12px;
  }
`;

async function getShippingSessionWithRetry() {
  /**
   * chrome.tabs.create resolves as soon as the tab exists, while the page may
   * start executing the content script almost immediately. A short retry keeps
   * the toolbar reliable if the content script asks for its session before the
   * background service has finished binding tabId -> sessionId.
   */
  for (let attempt = 0; attempt < 10; attempt++) {
    const session = await extensionApi.shipping.getCurrentTabSession();
    if (session) return session;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return null;
}

export default defineContentScript({
  matches: ['https://*.taobao.com/*', 'https://*.tmall.com/*'],
  runAt: 'document_idle',

  async main(ctx) {
    const session = await getShippingSessionWithRetry();
    if (!session) return;

    /**
     * The toolbar is mounted in Shadow DOM so Taobao/Tmall page CSS cannot
     * accidentally restyle extension controls, and our controls do not leak
     * styles back into the merchant page.
     */
    const ui = await createShadowRootUi<Root>(ctx, {
      name: 'wishop-shipping-toolbar',
      position: 'overlay',
      alignment: 'top-right',
      zIndex: 2147483647,
      anchor: 'body',
      css: toolbarCss,
      isolateEvents: true,
      onMount(container, _shadow, shadowHost) {
        shadowHost.style.setProperty('position', 'fixed', 'important');
        shadowHost.style.setProperty('top', '0', 'important');
        shadowHost.style.setProperty('left', '0', 'important');
        shadowHost.style.setProperty('z-index', '2147483647', 'important');
        shadowHost.style.setProperty('pointer-events', 'none', 'important');
        const root = createRoot(container);
        root.render(<ShippingToolbar session={session} />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
