import type {
  FullAccount,
  ProductAuditFailureDefaultAction,
  ProductAuditFailureRule,
  ProductAuditTaskConfig,
  ScheduledJob,
  StatusRule,
} from '../../shared/types';
import type { NotificationPreference } from '../../shared/notification';
import type { AppSettings } from '../../shared/settings';
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from '../../shared/settings.ts';

export interface StoreSchema {
  storageVersion: number;
  accounts: FullAccount[];
  activeAccountId: string;
  wxAccessTokens?: Record<string, StoredWxAccessToken>;
  scheduledJobs?: ScheduledJob[];
  productAuditRules?: ProductAuditFailureRule[];
  statusRules?: StatusRule[];
  notificationPreference?: NotificationPreference;
  appSettings?: AppSettings;
}

export interface StoredWxAccessToken {
  accountId: string;
  appId: string;
  accessToken: string;
  expiresAt: number;
  updatedAt: number;
}

export const CURRENT_STORAGE_VERSION = 16;

export const DEFAULT_PRODUCT_AUDIT_CONFIG: ProductAuditTaskConfig = {
  submitUnauditedDrafts: true,
  submitLimit: 0,
};

export const DEFAULT_PRODUCT_AUDIT_FAILURE_DEFAULT_ACTION: ProductAuditFailureDefaultAction = 'deleteDraft';

export const DEFAULT_PRODUCT_AUDIT_FAILURE_RULES: ProductAuditFailureRule[] = [
  { id: 'stop-1002002', enabled: true, action: 'stopTask', match: { type: 'outerErrorCode', code: 1002002 }, description: '本店铺近1天内提审次数超过限制，请1天后再试' },
  { id: 'stop-10020066', enabled: true, action: 'stopTask', match: { type: 'outerErrorCode', code: 10020066 }, description: '本店铺近1小时内提审次数超过限制，请1小时后再试' },
  { id: 'stop-10020111', enabled: true, action: 'stopTask', match: { type: 'outerErrorCode', code: 10020111 }, description: '本店铺近1天内提审次数超过限制，请1天后再试' },
  { id: 'stop-6600148', enabled: true, action: 'stopTask', match: { type: 'outerErrorCode', code: 6600148 }, description: '今日提审次数已用尽，请明日再试' },
  { id: 'stop-10020208', enabled: true, action: 'stopTask', match: { type: 'outerErrorCode', code: 10020208 }, description: '本店铺的商品提审能力被封禁，请登录微信小店后台管理页查看详情' },
  { id: 'stop-10020246', enabled: true, action: 'stopTask', match: { type: 'outerErrorCode', code: 10020246 }, description: '0元保证金试运营商品数超出限制，上架中与审核中商品总数不得超过100个' },
  { id: 'stop-10020247', enabled: true, action: 'stopTask', match: { type: 'outerErrorCode', code: 10020247 }, description: '由于未在限定时间内完成升级，该店铺已被限制商品新增能力' },
  { id: 'keep-6600144', enabled: true, action: 'keepDraft', match: { type: 'embeddedErrorCode', code: 6600144 }, description: '需要开通运费险或处理店铺体验问题，保留草稿待人工处理' },
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

export function normalizeProductAuditTaskConfig(config: Partial<ProductAuditTaskConfig> | null | undefined): ProductAuditTaskConfig {
  return {
    submitUnauditedDrafts: config?.submitUnauditedDrafts ?? DEFAULT_PRODUCT_AUDIT_CONFIG.submitUnauditedDrafts,
    submitLimit: typeof config?.submitLimit === 'number' ? config.submitLimit : DEFAULT_PRODUCT_AUDIT_CONFIG.submitLimit,
  };
}

export async function readStore(): Promise<StoreSchema> {
  const data = await chrome.storage.local.get([
    'storageVersion',
    'accounts',
    'activeAccountId',
    'wxAccessTokens',
    'scheduledJobs',
    'productAuditRules',
    'statusRules',
    'notificationPreference',
    'appSettings',
  ]);
  return {
    storageVersion: typeof data.storageVersion === 'number' ? data.storageVersion : 0,
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
    activeAccountId: typeof data.activeAccountId === 'string' ? data.activeAccountId : '',
    wxAccessTokens: typeof data.wxAccessTokens === 'object' && data.wxAccessTokens !== null
      ? data.wxAccessTokens as Record<string, StoredWxAccessToken>
      : {},
    scheduledJobs: Array.isArray(data.scheduledJobs) ? data.scheduledJobs : [],
    productAuditRules: Array.isArray(data.productAuditRules) ? data.productAuditRules : undefined,
    statusRules: Array.isArray(data.statusRules) ? data.statusRules : undefined,
    notificationPreference: typeof data.notificationPreference === 'object' && data.notificationPreference !== null
      ? data.notificationPreference as NotificationPreference
      : undefined,
    appSettings: typeof data.appSettings === 'object' && data.appSettings !== null
      ? normalizeAppSettings(data.appSettings as Partial<AppSettings>)
      : DEFAULT_APP_SETTINGS,
  };
}

export async function writeStore(patch: Partial<StoreSchema>): Promise<void> {
  await chrome.storage.local.set(patch);
}

export function normalizeAccount(account: FullAccount): FullAccount {
  return {
    ...account,
    productAuditConfig: normalizeProductAuditTaskConfig(account.productAuditConfig),
    violationWords: account.violationWords || [],
    productAuditLogs: account.productAuditLogs || [],
    violationLogs: account.violationLogs || [],
    productSources: account.productSources || [],
    orderAssociations: account.orderAssociations || [],
    realAddressCaches: account.realAddressCaches || [],
  };
}

export async function updateAccountData(accountId: string, updater: (account: FullAccount) => void): Promise<void> {
  const store = await readStore();
  const idx = store.accounts.findIndex(a => a.id === accountId);
  if (idx === -1) return;
  updater(store.accounts[idx]);
  await writeStore({ accounts: store.accounts });
}
