/**
 * content 端从后台读出当前 tab 关联的会话。
 *
 * 「复制商品」业务域下，content 端只需要两件事：
 *  - 是否有「复制商品」工作台会话（决定要不要跑复制工作流）
 *  - 当前 tab 的工作台身份（决定要不要显示工作台提示）
 *
 * 历史上有 4 个并发会话（发货、采购、退款、复制商品）一起被解析，
 * 全部随业务域删除。
 */
import type { ProductCopySession, TaobaoWorkspaceRole } from '../../../shared/types';
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
  productCopySession: ProductCopySession | null;
  workspaceRole: TaobaoWorkspaceRole | null;
}

export async function resolveTaobaoContentSessions(): Promise<TaobaoContentSessions> {
  const [productCopySession, workspaceRole] = await Promise.all([
    waitForSession(() => extensionApi.productCopy.getCurrentTabSession()),
    extensionApi.taobaoWorkspace.getCurrentRole().catch(() => null),
  ]);
  return { productCopySession, workspaceRole };
}
