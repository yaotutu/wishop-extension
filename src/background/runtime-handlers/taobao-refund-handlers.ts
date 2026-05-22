import type { CreateTaobaoRefundSessionInput, TaobaoRefundPrepareSnapshot, TaobaoSecurityChallengeSnapshot } from '../../shared/types';
import type { RuntimeHandlerMap } from '../router/runtime-router';
import {
  completeTaobaoRefundPreparation,
  completeTaobaoRefundSubmission,
  failTaobaoRefundSession,
  openTaobaoRefundSessionTab,
  reportTaobaoRefundChallenge,
  resolveTaobaoRefundChallenge,
  updateTaobaoRefundSessionStatus,
} from '../taobao-refund/taobao-refund-session-service';

type GetCurrentTabSession = (sender?: chrome.runtime.MessageSender) => Promise<unknown>;

export function createTaobaoRefundRuntimeHandlers(getCurrentTabSession: GetCurrentTabSession): RuntimeHandlerMap {
  return {
    async 'taobaoRefund:open'(args) {
      return openTaobaoRefundSessionTab(args[0] as CreateTaobaoRefundSessionInput);
    },
    async 'taobaoRefund:getCurrentTabSession'(_args, sender) {
      return getCurrentTabSession(sender);
    },
    async 'taobaoRefund:markPageReady'(args) {
      return updateTaobaoRefundSessionStatus(args[0] as string, 'page-ready');
    },
    async 'taobaoRefund:reportChallenge'(args) {
      return reportTaobaoRefundChallenge(args[0] as string, args[1] as TaobaoSecurityChallengeSnapshot);
    },
    async 'taobaoRefund:resolveChallenge'(args) {
      return resolveTaobaoRefundChallenge(args[0] as string);
    },
    async 'taobaoRefund:prepared'(args) {
      return completeTaobaoRefundPreparation(args[0] as string, args[1] as TaobaoRefundPrepareSnapshot);
    },
    async 'taobaoRefund:submitted'(args) {
      return completeTaobaoRefundSubmission(args[0] as string, args[1] as TaobaoRefundPrepareSnapshot);
    },
    async 'taobaoRefund:fail'(args) {
      return failTaobaoRefundSession(args[0] as string, args[1] as string);
    },
  };
}
