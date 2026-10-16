export type { AddLogFn } from '../shared/types';
export type { StoreSchema } from './store/core';

export {
  DEFAULT_PRODUCT_AUDIT_CONFIG,
  DEFAULT_PRODUCT_AUDIT_FAILURE_RULES,
  DEFAULT_STATUS_RULES,
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
  addModuleLog,
  clearProductAuditLogs,
  clearModuleLogs,
  createScopedProductAuditLog,
  createScopedModuleLog,
  createScopedComplianceLog,
  getProductAuditLogs,
  getModuleLogs,
  onModuleLog,
} from './store/log-repository';

export {
  getProductAuditConfig,
  setProductAuditConfig,
} from './store/product-audit-config-repository';

export {
  getProductSources,
  removeProductSource,
  setProductSources,
} from './store/product-source-repository';

export {
  getDefaultProductAuditFailurePolicy,
  getDefaultStatusRules,
  getProductAuditFailurePolicy,
  getStatusRules,
  setProductAuditFailurePolicy,
  setStatusRules,
} from './store/rule-repository';

export {
  getLicenseState,
  setLicenseState,
} from './store/license-repository';
