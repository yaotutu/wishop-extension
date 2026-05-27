import { clearListingLogs, getListingLogs } from '../store/log-repository';
import { clearActivityLogs, getActivityLogs } from '../activity-logs/activity-log-store';
import type { RuntimeHandlerMap } from '../router/runtime-router';

export function createLogRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'listingLogs:get'(args) {
      return getListingLogs(args[0] as string);
    },
    async 'listingLogs:clear'(args) {
      return clearListingLogs(args[0] as string);
    },
    async 'activityLogs:list'() {
      return getActivityLogs();
    },
    async 'activityLogs:clear'() {
      return clearActivityLogs();
    },
  };
}
