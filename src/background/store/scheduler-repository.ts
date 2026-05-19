import { v4 as uuidv4 } from 'uuid';
import type { GlobalScheduledTask, ScheduledTask } from '../../shared/types';
import { getAccount } from './account-repository';
import { readStore, updateAccountData, writeStore } from './core';

export async function getSchedulers(accountId: string): Promise<ScheduledTask[]> {
  return (await getAccount(accountId))?.schedulers || [];
}

export async function addScheduler(accountId: string, task: Omit<ScheduledTask, 'id' | 'lastRunDate' | 'todayListedCount'>): Promise<ScheduledTask> {
  const newTask: ScheduledTask = { ...task, id: uuidv4(), lastRunDate: '', todayListedCount: 0 };
  await updateAccountData(accountId, account => {
    account.schedulers = [...(account.schedulers || []), newTask];
  });
  return newTask;
}

export async function updateScheduler(accountId: string, taskId: string, patch: Partial<ScheduledTask>): Promise<void> {
  await updateAccountData(accountId, account => {
    account.schedulers = (account.schedulers || []).map(task => task.id === taskId ? { ...task, ...patch } : task);
  });
}

export async function removeScheduler(accountId: string, taskId: string): Promise<void> {
  await updateAccountData(accountId, account => {
    account.schedulers = (account.schedulers || []).filter(task => task.id !== taskId);
  });
}

export async function getGlobalSchedulers(): Promise<GlobalScheduledTask[]> {
  return (await readStore()).globalSchedulers || [];
}

export async function addGlobalScheduler(task: Omit<GlobalScheduledTask, 'id' | 'accountStats'>): Promise<GlobalScheduledTask> {
  const store = await readStore();
  const newTask: GlobalScheduledTask = { ...task, id: uuidv4(), accountStats: {} };
  await writeStore({ globalSchedulers: [...(store.globalSchedulers || []), newTask] });
  return newTask;
}

export async function updateGlobalScheduler(taskId: string, patch: Partial<GlobalScheduledTask>): Promise<void> {
  const store = await readStore();
  await writeStore({
    globalSchedulers: (store.globalSchedulers || []).map(task => task.id === taskId ? { ...task, ...patch } : task),
  });
}

export async function removeGlobalScheduler(taskId: string): Promise<void> {
  const store = await readStore();
  await writeStore({
    globalSchedulers: (store.globalSchedulers || []).filter(task => task.id !== taskId),
  });
}

export async function updateGlobalSchedulerAccountStat(
  taskId: string,
  accountId: string,
  patch: Partial<GlobalScheduledTask['accountStats'][string]>,
): Promise<void> {
  const store = await readStore();
  await writeStore({
    globalSchedulers: (store.globalSchedulers || []).map(task => {
      if (task.id !== taskId) return task;
      const prev = task.accountStats?.[accountId] || { lastRunDate: '', todayListedCount: 0 };
      return {
        ...task,
        accountStats: {
          ...(task.accountStats || {}),
          [accountId]: { ...prev, ...patch },
        },
      };
    }),
  });
}
