import { getClient } from '../wxshop/client-registry';
import type { RuntimeHandlerMap } from '../router/runtime-router';

export function createQuotaRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'quota:get'(args) {
      return (await getClient(args[0] as string)).getAuditQuota();
    },
  };
}
