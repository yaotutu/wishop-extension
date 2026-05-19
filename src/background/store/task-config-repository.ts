import type { TaskConfig } from '../../shared/types';
import { getAccount } from './account-repository';
import { DEFAULT_TASK_CONFIG, updateAccountData } from './core';

export async function getTaskConfig(accountId: string): Promise<TaskConfig> {
  return (await getAccount(accountId))?.taskConfig || DEFAULT_TASK_CONFIG;
}

export async function setTaskConfig(accountId: string, taskConfig: TaskConfig): Promise<void> {
  await updateAccountData(accountId, account => {
    account.taskConfig = taskConfig;
  });
}
