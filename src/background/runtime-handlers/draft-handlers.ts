import type { RuntimeHandlerMap } from '../router/runtime-router';
import type { DraftProductDeleteInput } from '../../shared/types';

interface DraftHandlerDeps {
  fetchDrafts: (accountId: string, reset?: boolean) => Promise<unknown>;
  submitDraftAudit: (accountId: string, productId: string) => Promise<unknown>;
  deleteDraft: (accountId: string, input: DraftProductDeleteInput) => Promise<unknown>;
}

export function createDraftRuntimeHandlers(deps: DraftHandlerDeps): RuntimeHandlerMap {
  return {
    async 'drafts:fetch'(args) {
      return deps.fetchDrafts(args[0] as string, args[1] as boolean | undefined);
    },
    async 'drafts:submitAudit'(args) {
      return deps.submitDraftAudit(args[0] as string, args[1] as string);
    },
    async 'drafts:delete'(args) {
      return deps.deleteDraft(args[0] as string, args[1] as DraftProductDeleteInput);
    },
  };
}
