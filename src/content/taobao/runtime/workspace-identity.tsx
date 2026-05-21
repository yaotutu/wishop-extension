import React from 'react';
import type { TaobaoWorkspaceRole } from '../../../shared/types';

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

export function installWorkspaceIdentity(role: TaobaoWorkspaceRole): () => void {
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

export const WorkTabNotice: React.FC<{ role: TaobaoWorkspaceRole }> = ({ role }) => {
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
