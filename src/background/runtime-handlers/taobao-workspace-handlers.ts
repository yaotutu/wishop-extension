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
