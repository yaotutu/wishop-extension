export type { AddLogFn } from '../shared/types';
export type { StoreSchema } from './store/core';

export {
  DEFAULT_BLACKLIST,
  DEFAULT_STATUS_RULES,
  DEFAULT_TASK_CONFIG,
  CURRENT_STORAGE_VERSION,
  normalizeAccount,
  readStore,
  updateAccountData,
  writeStore,
} from './store/core';

export { migrateStore } from './store/migrations';

export {
  addAccount,
  getAccount,
  getAccounts,
  getActiveAccountId,
  getConfig,
  removeAccount,
  setActiveAccountId,
  setConfig,
  updateAccount,
} from './store/account-repository';

export {
  addLog,
  clearLogs,
  createScopedAddLog,
  getLogs,
  onLog,
} from './store/log-repository';

export {
  getTaskConfig,
  setTaskConfig,
} from './store/task-config-repository';

export {
  getProductSources,
  removeProductSource,
  setProductSources,
} from './store/product-source-repository';

export {
  getBlacklistRules,
  getDefaultBlacklistCodes,
  getDefaultStatusRules,
  getSkipKeywords,
  getStatusRules,
  getViolationWords,
  setBlacklistRules,
  setSkipKeywords,
  setStatusRules,
  setViolationWords,
} from './store/rule-repository';

export {
  getLicenseState,
  setLicenseState,
} from './store/license-repository';
