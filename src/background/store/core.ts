import type {
  BlacklistRule,
  FullAccount,
  GlobalScheduledTask,
  StatusRule,
  TaskConfig,
} from '../../shared/types';

export interface StoreSchema {
  storageVersion: number;
  accounts: FullAccount[];
  activeAccountId: string;
  globalSchedulers?: GlobalScheduledTask[];
  skipKeywords?: string[];
  blacklistRules?: BlacklistRule[];
  statusRules?: StatusRule[];
}

export const CURRENT_STORAGE_VERSION = 1;

export const DEFAULT_TASK_CONFIG: TaskConfig = {
  listUnreviewed: true,
  listUnreviewedQuantity: 0,
  autoDeleteFailed: true,
};

export const DEFAULT_BLACKLIST: BlacklistRule[] = [
  { code: 1002002, description: '本店铺近1天内提审次数超过限制，请1天后再试' },
  { code: 10020066, description: '本店铺近1小时内提审次数超过限制，请1小时后再试' },
  { code: 10020111, description: '本店铺近1天内提审次数超过限制，请1天后再试' },
  { code: 6600148, description: '今日提审次数已用尽，请明日再试' },
  { code: 10020208, description: '本店铺的上架功能被封禁，请登录微信小店后台管理页查看详情' },
  { code: 10020246, description: '0元保证金试运营商品数超出限制，上架中与审核中商品总数不得超过100个' },
  { code: 10020247, description: '由于未在限定时间内完成升级，该店铺已被限制商品新增能力' },
];

export const DEFAULT_STATUS_RULES: StatusRule[] = [
  { editStatus: 72, label: '未审核', action: 'submit' },
  { editStatus: 1, label: '编辑中', action: 'submit' },
  { editStatus: 3, label: '审核失败', action: 'delete' },
  { editStatus: 2, label: '审核中', action: 'skip' },
  { editStatus: 4, label: '成功', action: 'skip' },
  { editStatus: 7, label: '上传中', action: 'skip' },
  { editStatus: 8, label: '上传失败', action: 'skip' },
];

export async function readStore(): Promise<StoreSchema> {
  const data = await chrome.storage.local.get(['storageVersion', 'accounts', 'activeAccountId', 'globalSchedulers', 'skipKeywords', 'blacklistRules', 'statusRules']);
  return {
    storageVersion: typeof data.storageVersion === 'number' ? data.storageVersion : 0,
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
    activeAccountId: typeof data.activeAccountId === 'string' ? data.activeAccountId : '',
    globalSchedulers: Array.isArray(data.globalSchedulers) ? data.globalSchedulers : [],
    skipKeywords: Array.isArray(data.skipKeywords) ? data.skipKeywords : [],
    blacklistRules: Array.isArray(data.blacklistRules) ? data.blacklistRules : undefined,
    statusRules: Array.isArray(data.statusRules) ? data.statusRules : undefined,
  };
}

export async function writeStore(patch: Partial<StoreSchema>): Promise<void> {
  await chrome.storage.local.set(patch);
}

export function normalizeAccount(account: FullAccount): FullAccount {
  return {
    ...account,
    schedulers: account.schedulers || [],
    taskConfig: account.taskConfig || DEFAULT_TASK_CONFIG,
    violationWords: account.violationWords || [],
    logs: account.logs || [],
    productSources: account.productSources || [],
  };
}

export async function updateAccountData(accountId: string, updater: (account: FullAccount) => void): Promise<void> {
  const store = await readStore();
  const idx = store.accounts.findIndex(a => a.id === accountId);
  if (idx === -1) return;
  updater(store.accounts[idx]);
  await writeStore({ accounts: store.accounts });
}
