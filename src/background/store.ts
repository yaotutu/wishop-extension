import { v4 as uuidv4 } from 'uuid';
import type {
  Account,
  AddLogFn,
  BlacklistRule,
  Config,
  FullAccount,
  GlobalScheduledTask,
  LogEntry,
  ScheduledTask,
  StatusRule,
  TaskConfig,
} from '../shared/types';

export type { AddLogFn };

export interface StoreSchema {
  accounts: FullAccount[];
  activeAccountId: string;
  globalSchedulers?: GlobalScheduledTask[];
  skipKeywords?: string[];
  blacklistRules?: BlacklistRule[];
  statusRules?: StatusRule[];
}

type StoreListener = (log: LogEntry) => void;

const listeners = new Map<string, Set<StoreListener>>();
let logCounter = 0;

const DEFAULT_TASK_CONFIG: TaskConfig = {
  listUnreviewed: true,
  listUnreviewedQuantity: 0,
  autoDeleteFailed: true,
};

const DEFAULT_BLACKLIST: BlacklistRule[] = [
  { code: 1002002, description: '本店铺近1天内提审次数超过限制，请1天后再试' },
  { code: 10020066, description: '本店铺近1小时内提审次数超过限制，请1小时后再试' },
  { code: 10020111, description: '本店铺近1天内提审次数超过限制，请1天后再试' },
  { code: 6600148, description: '今日提审次数已用尽，请明日再试' },
  { code: 10020208, description: '本店铺的上架功能被封禁，请登录微信小店后台管理页查看详情' },
  { code: 10020246, description: '0元保证金试运营商品数超出限制，上架中与审核中商品总数不得超过100个' },
  { code: 10020247, description: '由于未在限定时间内完成升级，该店铺已被限制商品新增能力' },
];

const DEFAULT_STATUS_RULES: StatusRule[] = [
  { editStatus: 72, label: '未审核', action: 'submit' },
  { editStatus: 1, label: '编辑中', action: 'submit' },
  { editStatus: 3, label: '审核失败', action: 'delete' },
  { editStatus: 2, label: '审核中', action: 'skip' },
  { editStatus: 4, label: '成功', action: 'skip' },
  { editStatus: 7, label: '上传中', action: 'skip' },
  { editStatus: 8, label: '上传失败', action: 'skip' },
];

async function readStore(): Promise<StoreSchema> {
  const data = await chrome.storage.local.get(['accounts', 'activeAccountId', 'globalSchedulers', 'skipKeywords', 'blacklistRules', 'statusRules']);
  return {
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
    activeAccountId: typeof data.activeAccountId === 'string' ? data.activeAccountId : '',
    globalSchedulers: Array.isArray(data.globalSchedulers) ? data.globalSchedulers : [],
    skipKeywords: Array.isArray(data.skipKeywords) ? data.skipKeywords : [],
    blacklistRules: Array.isArray(data.blacklistRules) ? data.blacklistRules : undefined,
    statusRules: Array.isArray(data.statusRules) ? data.statusRules : undefined,
  };
}

async function writeStore(patch: Partial<StoreSchema>): Promise<void> {
  await chrome.storage.local.set(patch);
}

async function updateAccountData(accountId: string, updater: (account: FullAccount) => void): Promise<void> {
  const store = await readStore();
  const idx = store.accounts.findIndex(a => a.id === accountId);
  if (idx === -1) return;
  updater(store.accounts[idx]);
  await writeStore({ accounts: store.accounts });
}

function normalizeAccount(account: FullAccount): FullAccount {
  return {
    ...account,
    schedulers: account.schedulers || [],
    taskConfig: account.taskConfig || DEFAULT_TASK_CONFIG,
    violationWords: account.violationWords || [],
    logs: account.logs || [],
  };
}

export function onLog(accountId: string, listener: StoreListener): () => void {
  const set = listeners.get(accountId) || new Set<StoreListener>();
  set.add(listener);
  listeners.set(accountId, set);
  return () => set.delete(listener);
}

function emitLog(accountId: string, log: LogEntry): void {
  listeners.get(accountId)?.forEach(listener => listener(log));
  chrome.runtime.sendMessage({ type: 'event', event: `log:added:${accountId}`, payload: log }).catch(() => {});
  chrome.runtime.sendMessage({ type: 'event', event: `violation:log:${accountId}`, payload: log }).catch(() => {});
}

export function createScopedAddLog(accountId: string): AddLogFn {
  return (log: Omit<LogEntry, 'id' | 'timestamp'>) => {
    void addLog(accountId, log);
  };
}

export async function getAccounts(): Promise<Account[]> {
  const store = await readStore();
  return store.accounts.map(normalizeAccount);
}

export async function getAccount(accountId: string): Promise<FullAccount | undefined> {
  const store = await readStore();
  const account = store.accounts.find(a => a.id === accountId);
  return account ? normalizeAccount(account) : undefined;
}

export async function addAccount(name: string, config: Config): Promise<FullAccount> {
  const store = await readStore();
  const account: FullAccount = {
    id: uuidv4(),
    name,
    config,
    schedulers: [],
    taskConfig: DEFAULT_TASK_CONFIG,
    violationWords: [],
    logs: [],
    createdAt: Date.now(),
  };
  store.accounts.push(account);
  await writeStore({
    accounts: store.accounts,
    activeAccountId: store.activeAccountId || account.id,
  });
  return account;
}

export async function removeAccount(accountId: string): Promise<void> {
  const store = await readStore();
  const accounts = store.accounts.filter(a => a.id !== accountId);
  await writeStore({
    accounts,
    activeAccountId: store.activeAccountId === accountId ? (accounts[0]?.id || '') : store.activeAccountId,
  });
}

export async function updateAccount(accountId: string, patch: Partial<Pick<FullAccount, 'name' | 'config'>>): Promise<void> {
  await updateAccountData(accountId, account => {
    if (patch.name !== undefined) account.name = patch.name;
    if (patch.config !== undefined) account.config = patch.config;
  });
}

export async function getActiveAccountId(): Promise<string> {
  return (await readStore()).activeAccountId;
}

export async function setActiveAccountId(accountId: string): Promise<void> {
  await writeStore({ activeAccountId: accountId });
}

export async function getConfig(accountId: string): Promise<Config> {
  const account = await getAccount(accountId);
  return account?.config || { appId: '', appSecret: '' };
}

export async function setConfig(accountId: string, config: Config): Promise<void> {
  await updateAccount(accountId, { config });
}

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

export async function getTaskConfig(accountId: string): Promise<TaskConfig> {
  return (await getAccount(accountId))?.taskConfig || DEFAULT_TASK_CONFIG;
}

export async function setTaskConfig(accountId: string, taskConfig: TaskConfig): Promise<void> {
  await updateAccountData(accountId, account => {
    account.taskConfig = taskConfig;
  });
}

export async function getLogs(accountId: string): Promise<LogEntry[]> {
  const account = await getAccount(accountId);
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return (account?.logs || []).filter(log => log.timestamp > sevenDaysAgo);
}

export async function addLog(accountId: string, log: Omit<LogEntry, 'id' | 'timestamp'>): Promise<void> {
  logCounter++;
  const entry: LogEntry = { ...log, id: `${Date.now()}-${logCounter}`, timestamp: Date.now() };
  await updateAccountData(accountId, account => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    account.logs = (account.logs || []).filter(item => item.timestamp > sevenDaysAgo);
    account.logs.push(entry);
  });
  emitLog(accountId, entry);
}

export async function clearLogs(accountId: string): Promise<void> {
  await updateAccountData(accountId, account => {
    account.logs = [];
  });
}

export async function getViolationWords(accountId: string): Promise<string[]> {
  return (await getAccount(accountId))?.violationWords || [];
}

export async function setViolationWords(accountId: string, words: string[]): Promise<void> {
  await updateAccountData(accountId, account => {
    account.violationWords = words;
  });
}

export function getDefaultBlacklistCodes(): number[] {
  return DEFAULT_BLACKLIST.map(rule => rule.code);
}

export async function getBlacklistRules(): Promise<BlacklistRule[]> {
  const stored = (await readStore()).blacklistRules;
  if (!stored) return DEFAULT_BLACKLIST;
  const codeSet = new Set(stored.map(rule => rule.code));
  return [...stored, ...DEFAULT_BLACKLIST.filter(rule => !codeSet.has(rule.code))];
}

export async function setBlacklistRules(rules: BlacklistRule[]): Promise<void> {
  const defaultCodes = new Set(DEFAULT_BLACKLIST.map(rule => rule.code));
  await writeStore({ blacklistRules: rules.filter(rule => !defaultCodes.has(rule.code)) });
}

export async function getSkipKeywords(): Promise<string[]> {
  return (await readStore()).skipKeywords || [];
}

export async function setSkipKeywords(keywords: string[]): Promise<void> {
  await writeStore({ skipKeywords: keywords });
}

export async function getStatusRules(): Promise<StatusRule[]> {
  const stored = (await readStore()).statusRules;
  if (!stored) return DEFAULT_STATUS_RULES;
  const statusSet = new Set(stored.map(rule => rule.editStatus));
  return [...stored, ...DEFAULT_STATUS_RULES.filter(rule => !statusSet.has(rule.editStatus))];
}

export async function setStatusRules(rules: StatusRule[]): Promise<void> {
  await writeStore({ statusRules: rules });
}

export function getDefaultStatusRules(): StatusRule[] {
  return DEFAULT_STATUS_RULES;
}
