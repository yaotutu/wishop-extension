import { clearListingLogs, getListingLogs } from '../store/log-repository';
import { clearGlobalLogs, getGlobalLogs } from '../global-logs/global-log-store';
import type { RuntimeHandlerMap } from '../router/runtime-router';

export function createLogRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'listingLogs:get'(args) {
      return getListingLogs(args[0] as string);
    },
    async 'listingLogs:clear'(args) {
      return clearListingLogs(args[0] as string);
    },
    async 'globalLogs:list'() {
      return getGlobalLogs();
    },
    async 'globalLogs:clear'() {
      return clearGlobalLogs();
    },
  };
}
