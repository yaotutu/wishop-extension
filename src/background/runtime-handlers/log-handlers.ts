import { clearActivityLogs, getActivityLogs } from '../activity-logs/activity-log-store';
import type { RuntimeHandlerMap } from '../router/runtime-router';

export function createLogRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'activityLogs:list'() {
      return getActivityLogs();
    },
    async 'activityLogs:clear'() {
      return clearActivityLogs();
    },
  };
}
