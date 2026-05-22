import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { PurchaseLookupSession, ShippingSession, TaobaoRefundSession, TaobaoWorkspaceRole } from '../../../shared/types';
import { PurchaseLookupToolbar } from '../PurchaseLookupToolbar';
import { ShippingToolbar } from '../ShippingToolbar';
import { TaobaoRefundToolbar } from '../TaobaoRefundToolbar';
import { toolbarCss } from './toolbar-style';
import { installWorkspaceIdentity, WorkTabNotice } from './workspace-identity';

interface MountTaobaoToolbarOptions {
  shippingSession: ShippingSession | null;
  purchaseLookupSession: PurchaseLookupSession | null;
  taobaoRefundSession: TaobaoRefundSession | null;
  workspaceRole: TaobaoWorkspaceRole | null;
}

export async function mountTaobaoToolbar(
  ctx: ContentScriptContext,
  { shippingSession, purchaseLookupSession, taobaoRefundSession, workspaceRole }: MountTaobaoToolbarOptions,
): Promise<void> {
  const cleanupIdentity = workspaceRole ? installWorkspaceIdentity(workspaceRole) : undefined;

  /**
   * The toolbar is mounted in Shadow DOM so Taobao/Tmall page CSS cannot
   * restyle extension controls, and our controls do not leak styles back into
   * the merchant page.
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
          {taobaoRefundSession && <TaobaoRefundToolbar session={taobaoRefundSession} />}
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
