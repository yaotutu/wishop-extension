import type { CreatePurchaseLookupSessionInput, TaobaoSecurityChallengeSnapshot, TaobaoPurchaseOrderSnapshot } from '../../shared/types';
import type { RuntimeHandlerMap } from '../router/runtime-router';
import {
  completePurchaseLookupSession,
  failPurchaseLookupSession,
  openPurchaseLookupSessionTab,
  reportPurchaseLookupChallenge,
  resolvePurchaseLookupChallenge,
  updatePurchaseLookupSessionStatus,
} from '../purchase-lookup/purchase-lookup-session-service';

type GetCurrentTabSession = (sender?: chrome.runtime.MessageSender) => Promise<unknown>;

export function createPurchaseLookupRuntimeHandlers(getCurrentTabSession: GetCurrentTabSession): RuntimeHandlerMap {
  return {
    async 'purchaseLookup:open'(args) {
      return openPurchaseLookupSessionTab(args[0] as CreatePurchaseLookupSessionInput);
    },
    async 'purchaseLookup:getCurrentTabSession'(_args, sender) {
      return getCurrentTabSession(sender);
    },
    async 'purchaseLookup:markPageReady'(args) {
      return updatePurchaseLookupSessionStatus(args[0] as string, 'page-ready');
    },
    async 'purchaseLookup:reportChallenge'(args) {
      return reportPurchaseLookupChallenge(args[0] as string, args[1] as TaobaoSecurityChallengeSnapshot);
    },
    async 'purchaseLookup:resolveChallenge'(args) {
      return resolvePurchaseLookupChallenge(args[0] as string);
    },
    async 'purchaseLookup:complete'(args) {
      return completePurchaseLookupSession(args[0] as string, args[1] as TaobaoPurchaseOrderSnapshot);
    },
    async 'purchaseLookup:fail'(args) {
      return failPurchaseLookupSession(args[0] as string, args[1] as string);
    },
  };
}
