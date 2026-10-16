import React from 'react';
import type { TaobaoWorkspaceRole } from '../../../shared/types';

const SHIPPING_WORK_NOTICE_HIDDEN_KEY = 'taobaoShippingWorkNoticeHidden';

function workTabTitle(role: TaobaoWorkspaceRole): string {
  return role === 'shipping' ? '店小七 · 下单工作页' : '店小七 · 后台任务页';
}

function workTabDescription(_role: TaobaoWorkspaceRole): string {
  // 文案保持通用：不绑定具体业务场景（下单/读物流/退款/采集等），
  // 否则每新增一个使用该工作页的场景都得回来改这里。
  return '这是店小七的工作页，插件会自动使用它完成淘宝相关操作，你一般无需手动处理这里的内容。';
}

function faviconDataUrl(): string {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
    '<rect width="64" height="64" rx="14" fill="#1677ff"/>',
    '<text x="32" y="42" text-anchor="middle" font-size="34" font-family="Arial, sans-serif" font-weight="700" fill="#fff">七</text>',
    '</svg>',
  ].join('');
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function installWorkspaceIdentity(role: TaobaoWorkspaceRole): () => void {
  const title = workTabTitle(role);
  const faviconHref = faviconDataUrl();
  let icon = document.querySelector<HTMLLinkElement>('link[data-dianxiaoqi-work-icon="true"]');
  if (!icon) {
    icon = document.createElement('link');
    icon.rel = 'icon';
    icon.type = 'image/svg+xml';
    icon.dataset.dianxiaoqiWorkIcon = 'true';
    document.head.appendChild(icon);
  }
  icon.href = faviconHref;
  const timer = window.setInterval(() => {
    if (document.title !== title) document.title = title;
    const currentIcon = document.querySelector<HTMLLinkElement>('link[data-dianxiaoqi-work-icon="true"]');
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

  // 落在淘宝登录页时不渲染：这是淘宝自己的登录界面（二维码/账号密码），
  // 插件的告知条出现在这里既无意义又会干扰用户登录。
  if (typeof location !== 'undefined' && /login\.(taobao|tmall)\.com|passport\.taobao\.com/.test(location.host)) {
    return null;
  }

  const hideNotice = React.useCallback(() => {
    setVisible(false);
    if (role === 'shipping') {
      void chrome.storage.local.set({ [SHIPPING_WORK_NOTICE_HIDDEN_KEY]: true }).catch(() => {});
    }
  }, [role]);

  if (!hydrated) return null;
  if (!visible) return null;
  return (
    <div className={`dianxiaoqi-work-tab-notice dianxiaoqi-work-tab-notice--${role === 'shipping' ? 'shipping' : 'task'}`}>
      <div className="dianxiaoqi-work-tab-notice__header">
        <strong>{workTabTitle(role)}</strong>
        {role === 'shipping' && (
          <button
            type="button"
            className="dianxiaoqi-work-tab-notice__close"
            onClick={hideNotice}
            title="永久隐藏提示"
          >
            -
          </button>
        )}
      </div>
      <span>{workTabDescription(role)}</span>
      <div className="dianxiaoqi-work-tab-notice__footer">
        <span className="dianxiaoqi-work-tab-notice__state">
          请保持此标签页存在；关闭后插件会在下次需要时自动重新创建。
        </span>
      </div>
    </div>
  );
};
