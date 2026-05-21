import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import type { TaobaoWorkspaceRole } from '../src/shared/types';
import { PurchaseLookupToolbar } from '../src/content/taobao/PurchaseLookupToolbar';
import { ShippingToolbar } from '../src/content/taobao/ShippingToolbar';
import { installCheckoutAddressFrameBridge, isTaobaoAddressFramePage } from '../src/content/taobao/adapters/checkout-address-adapter';
import { resolveTaobaoContentSessions } from '../src/content/taobao/runtime/session-resolver';

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
    cursor: move;
    user-select: none;
    touch-action: none;
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
  .wishop-shipping-inline-primary {
    width: 100%;
    height: 30px;
    margin-top: 6px;
    border: 1px solid #1677ff;
    border-radius: 4px;
    background: #1677ff;
    color: #fff;
    cursor: pointer;
    font-weight: 600;
  }
  .wishop-shipping-inline-primary:hover {
    background: #4096ff;
    border-color: #4096ff;
  }
  .wishop-shipping-inline-primary:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }
  .wishop-shipping-inline-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    margin-top: 6px;
  }
  .wishop-shipping-inline-actions .wishop-shipping-inline-primary {
    margin-top: 0;
  }
  .wishop-shipping-inline-actions--single {
    grid-template-columns: 1fr;
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
  .wishop-shipping-profit-value {
    font-size: 14px;
    color: #1677ff;
  }
  .wishop-shipping-profit-value--negative {
    color: #cf1322;
  }
  .wishop-purchase-lookup {
    box-sizing: border-box;
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 2147483647;
    width: 360px;
    max-width: calc(100vw - 48px);
    padding: 12px;
    border: 1px solid rgba(250, 140, 22, 0.35);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
    color: #1f1f1f;
    font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    pointer-events: auto;
  }
  .wishop-purchase-lookup * {
    box-sizing: border-box;
  }
  .wishop-purchase-lookup__header {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }
  .wishop-purchase-lookup__header strong {
    font-size: 14px;
  }
  .wishop-purchase-lookup__header span {
    color: #fa8c16;
    font-size: 12px;
    white-space: nowrap;
  }
  .wishop-purchase-lookup__body {
    padding: 8px;
    border: 1px solid #f0f0f0;
    border-radius: 6px;
    background: #fff7e6;
  }
  .wishop-purchase-lookup__body p {
    margin: 0 0 6px;
    font-weight: 600;
  }
  .wishop-purchase-lookup__body ul {
    margin: 0;
    padding-left: 18px;
  }
  .wishop-purchase-lookup__body li,
  .wishop-purchase-lookup small {
    overflow-wrap: anywhere;
  }
  .wishop-purchase-lookup__actions {
    margin-top: 8px;
  }
  .wishop-purchase-lookup__actions button {
    height: 30px;
    padding: 0 10px;
    border: 1px solid #fa8c16;
    border-radius: 4px;
    background: #fa8c16;
    color: #fff;
    cursor: pointer;
  }
  .wishop-purchase-lookup__actions button:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }
  .wishop-work-tab-notice {
    box-sizing: border-box;
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
    width: min(520px, calc(100vw - 32px));
    padding: 10px 12px;
    border: 1px solid rgba(22, 119, 255, 0.28);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
    color: #1f1f1f;
    font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    pointer-events: auto;
  }
  .wishop-work-tab-notice--shipping {
    top: 12px;
    right: 16px;
    left: auto;
    transform: none;
    width: min(360px, calc(100vw - 32px));
    padding: 8px 10px;
  }
  .wishop-work-tab-notice--task {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(640px, calc(100vw - 48px));
    padding: 28px 32px;
    text-align: center;
    border-color: rgba(250, 140, 22, 0.38);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.2);
  }
  .wishop-work-tab-notice__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }
  .wishop-work-tab-notice strong {
    display: block;
    margin-bottom: 2px;
    color: #1677ff;
    font-size: 14px;
  }
  .wishop-work-tab-notice--task strong {
    margin-bottom: 10px;
    color: #fa8c16;
    font-size: 22px;
    line-height: 30px;
  }
  .wishop-work-tab-notice--task span {
    font-size: 15px;
    line-height: 24px;
  }
  .wishop-work-tab-notice__close {
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid #d9d9d9;
    border-radius: 4px;
    background: #fff;
    color: #595959;
    cursor: pointer;
    flex: 0 0 auto;
    line-height: 20px;
  }
  .wishop-work-tab-notice__close:hover {
    border-color: #1677ff;
    color: #1677ff;
  }
  .wishop-work-tab-notice span {
    display: block;
    color: #595959;
    overflow-wrap: anywhere;
  }
  .wishop-work-tab-notice__footer {
    margin-top: 8px;
  }
  .wishop-work-tab-notice__state {
    color: #8c8c8c;
    font-size: 12px;
  }
  .wishop-work-tab-notice--task .wishop-work-tab-notice__state {
    font-size: 13px;
  }
`;

const SHIPPING_WORK_NOTICE_HIDDEN_KEY = 'taobaoShippingWorkNoticeHidden';

function workTabTitle(role: TaobaoWorkspaceRole): string {
  return role === 'shipping' ? '微店管家 · 下单工作页' : '微店管家 · 后台任务页';
}

function workTabDescription(role: TaobaoWorkspaceRole): string {
  return role === 'shipping'
    ? '这是微店管家下单工作页，用于淘宝下单、付款识别和订单关联。'
    : '这是微店管家后台任务页，用于自动检查淘宝订单状态、物流公司和快递单号。这个页面不是给用户操作的，你不需要处理这里的内容。';
}

function faviconDataUrl(): string {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
    '<rect width="64" height="64" rx="14" fill="#1677ff"/>',
    '<text x="32" y="42" text-anchor="middle" font-size="34" font-family="Arial, sans-serif" font-weight="700" fill="#fff">微</text>',
    '</svg>',
  ].join('');
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function installWorkspaceIdentity(role: TaobaoWorkspaceRole): () => void {
  const title = workTabTitle(role);
  const faviconHref = faviconDataUrl();
  let icon = document.querySelector<HTMLLinkElement>('link[data-wishop-work-icon="true"]');
  if (!icon) {
    icon = document.createElement('link');
    icon.rel = 'icon';
    icon.type = 'image/svg+xml';
    icon.dataset.wishopWorkIcon = 'true';
    document.head.appendChild(icon);
  }
  icon.href = faviconHref;
  const timer = window.setInterval(() => {
    if (document.title !== title) document.title = title;
    const currentIcon = document.querySelector<HTMLLinkElement>('link[data-wishop-work-icon="true"]');
    if (currentIcon && currentIcon.href !== faviconHref) currentIcon.href = faviconHref;
  }, 1000);
  document.title = title;
  return () => window.clearInterval(timer);
}

const WorkTabNotice: React.FC<{ role: TaobaoWorkspaceRole }> = ({ role }) => {
  const [visible, setVisible] = React.useState(true);
  const [hydrated, setHydrated] = React.useState(role !== 'shipping');

  React.useEffect(() => {
    if (role !== 'shipping') return;
    let mounted = true;
    chrome.storage.local.get([SHIPPING_WORK_NOTICE_HIDDEN_KEY])
      .then(data => {
        if (!mounted) return;
        setVisible(data[SHIPPING_WORK_NOTICE_HIDDEN_KEY] !== true);
        setHydrated(true);
      })
      .catch(() => {
        if (mounted) setHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, [role]);

  const hideNotice = React.useCallback(() => {
    setVisible(false);
    if (role === 'shipping') {
      void chrome.storage.local.set({ [SHIPPING_WORK_NOTICE_HIDDEN_KEY]: true }).catch(() => {});
    }
  }, [role]);

  if (!hydrated) return null;
  if (!visible) return null;
  return (
    <div className={`wishop-work-tab-notice wishop-work-tab-notice--${role === 'shipping' ? 'shipping' : 'task'}`}>
      <div className="wishop-work-tab-notice__header">
        <strong>{workTabTitle(role)}</strong>
        {role === 'shipping' && (
          <button
            type="button"
            className="wishop-work-tab-notice__close"
            onClick={hideNotice}
            title="永久隐藏提示"
          >
            -
          </button>
        )}
      </div>
      <span>{workTabDescription(role)}</span>
      <div className="wishop-work-tab-notice__footer">
        <span className="wishop-work-tab-notice__state">
          {role === 'shipping'
            ? '隐藏后将不再自动显示；关闭工作页后，下次去发货会重新创建。'
            : '请保持此标签页存在；插件会在这里自动排队执行后台读取任务。'}
        </span>
      </div>
    </div>
  );
};

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

    const { shippingSession, purchaseLookupSession, workspaceRole } = await resolveTaobaoContentSessions();
    if (!shippingSession && !purchaseLookupSession && !workspaceRole) return;
    const cleanupIdentity = workspaceRole ? installWorkspaceIdentity(workspaceRole) : undefined;

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
        root.render(
          <>
            {shippingSession && <ShippingToolbar session={shippingSession} />}
            {purchaseLookupSession && <PurchaseLookupToolbar session={purchaseLookupSession} />}
            {workspaceRole && <WorkTabNotice role={workspaceRole} />}
          </>,
        );
        return root;
      },
      onRemove(root) {
        cleanupIdentity?.();
        root?.unmount();
      },
    });

    ui.mount();
  },
});
