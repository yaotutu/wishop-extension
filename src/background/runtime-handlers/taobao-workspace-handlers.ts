/**
 * 淘宝工作台角色识别 IPC handler。
 *
 * 单一通道：返回当前 tab 对应的工作台身份（'productCopy'），用于 content 端决定要不要
 * 在工具栏显示「复制商品」工作台提示。
 */
import type { RuntimeHandlerMap } from '../router/runtime-router';
import { getTaobaoWorkspaceRoleByTabId } from '../taobao-workspace/work-tab-service';

export function createTaobaoWorkspaceRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'taobaoWorkspace:getCurrentRole'(_args, sender) {
      const tabId = sender?.tab?.id;
      if (tabId === undefined) return null;
      return getTaobaoWorkspaceRoleByTabId(tabId);
    },
  };
}
