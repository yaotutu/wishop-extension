import type { RuntimeHandlerMap } from '../router/runtime-router';
import { getAuditQuota } from '../services/quota-service';

export function createQuotaRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'quota:get'(args) {
      return getAuditQuota(args[0] as string, Boolean(args[1]));
    },
  };
}
