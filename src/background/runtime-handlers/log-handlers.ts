import { clearLogs, getLogs } from '../store/log-repository';
import { clearGlobalLogs, getGlobalLogs } from '../global-logs/global-log-store';
import type { RuntimeHandlerMap } from '../router/runtime-router';

export function createLogRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'logs:get'(args) {
      return getLogs(args[0] as string);
    },
    async 'logs:clear'(args) {
      return clearLogs(args[0] as string);
    },
    async 'globalLogs:list'() {
      return getGlobalLogs();
    },
    async 'globalLogs:clear'() {
      return clearGlobalLogs();
    },
  };
}
