import type { TaskConfig } from '../../shared/types';
import { DEFAULT_TASK_CONFIG } from './core.ts';
import { ensureAccountWorkspace, updateAccountWorkspace } from './workspace-repository.ts';

export async function getTaskConfig(accountId: string): Promise<TaskConfig> {
  return (await ensureAccountWorkspace(accountId)).taskConfig || DEFAULT_TASK_CONFIG;
}

export async function setTaskConfig(accountId: string, taskConfig: TaskConfig): Promise<void> {
  await updateAccountWorkspace(accountId, workspace => {
    workspace.taskConfig = taskConfig;
  });
}
