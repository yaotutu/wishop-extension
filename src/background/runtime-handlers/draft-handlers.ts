import type { RuntimeHandlerMap } from '../router/runtime-router';

interface DraftHandlerDeps {
  fetchDrafts: (accountId: string, reset?: boolean) => Promise<unknown>;
  listDraft: (accountId: string, productId: string) => Promise<unknown>;
}

export function createDraftRuntimeHandlers(deps: DraftHandlerDeps): RuntimeHandlerMap {
  return {
    async 'drafts:fetch'(args) {
      return deps.fetchDrafts(args[0] as string, args[1] as boolean | undefined);
    },
    async 'drafts:list'(args) {
      return deps.listDraft(args[0] as string, args[1] as string);
    },
  };
}
