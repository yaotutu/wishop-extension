/**
 * 淘宝侧 Shadow DOM 工具栏挂载。
 *
 * 「复制商品」业务域下，content 端唯一需要在前台页面挂的工具栏元素是「工作台身份提示」，
 * 用于在工作台 tab 顶部告诉用户当前页面身份。其他业务 toolbar（发货 / 采购 / 退款等）
 * 都已随业务域一起删除。
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { TaobaoWorkspaceRole } from '../../../shared/types';
import { toolbarCss } from './toolbar-style';
import { installWorkspaceIdentity, WorkTabNotice } from './workspace-identity';

interface MountTaobaoToolbarOptions {
  workspaceRole: TaobaoWorkspaceRole | null;
}

export async function mountTaobaoToolbar(
  ctx: ContentScriptContext,
  { workspaceRole }: MountTaobaoToolbarOptions,
): Promise<void> {
  const cleanupIdentity = workspaceRole ? installWorkspaceIdentity(workspaceRole) : undefined;

  /**
   * The toolbar is mounted in Shadow DOM so Taobao/Tmall page CSS cannot
   * restyle extension controls, and our controls do not leak styles back into
   * the merchant page.
   */
  const ui = await createShadowRootUi<Root>(ctx, {
    name: 'dianxiaoqi-product-copy-toolbar',
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
}
