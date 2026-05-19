import type { CreateShippingSessionInput } from '../../shared/types';
import {
  openShippingSessionTab,
  updateShippingSessionStatus,
} from '../shipping/shipping-session-service';
import type { RuntimeHandlerMap } from '../router/runtime-router';

type GetCurrentTabSession = (sender?: chrome.runtime.MessageSender) => Promise<unknown>;

/**
 * Shipping IPC is isolated because both dashboard pages and Taobao content
 * scripts use it. Keeping the authorization check at this boundary prevents
 * future paid-feature checks from being bypassed through direct runtime calls.
 */
export function createShippingRuntimeHandlers(getCurrentTabSession: GetCurrentTabSession): RuntimeHandlerMap {
  return {
    async 'shipping:open'(args) {
      return openShippingSessionTab(args[0] as CreateShippingSessionInput);
    },
    async 'shipping:getCurrentTabSession'(_args, sender) {
      return getCurrentTabSession(sender);
    },
    async 'shipping:markPageReady'(args) {
      return updateShippingSessionStatus(args[0] as string, 'page-ready');
    },
    async 'shipping:complete'(args) {
      return updateShippingSessionStatus(args[0] as string, 'completed');
    },
    async 'shipping:fail'(args) {
      return updateShippingSessionStatus(args[0] as string, 'failed', args[1] as string);
    },
  };
}
