import type { TaskConfig } from '../../shared/types';
import { getTaskConfig, setTaskConfig } from '../store/task-config-repository';
import type { RuntimeHandlerMap } from '../router/runtime-router';

interface TaskHandlerDeps {
  runTask: (accountId: string, config: TaskConfig) => Promise<unknown>;
  stopTask: (accountId: string) => void;
}

export function createTaskRuntimeHandlers(deps: TaskHandlerDeps): RuntimeHandlerMap {
  return {
    async 'taskConfig:get'(args) {
      return getTaskConfig(args[0] as string);
    },
    async 'taskConfig:set'(args) {
      return setTaskConfig(args[0] as string, args[1] as TaskConfig);
    },
    async 'task:run'(args) {
      return deps.runTask(args[0] as string, args[1] as TaskConfig);
    },
    async 'task:stop'(args) {
      deps.stopTask(args[0] as string);
      return undefined;
    },
  };
}
