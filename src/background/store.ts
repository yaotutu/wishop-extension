/**
 * 持久化层的中央 barrel。
 *
 * 「复制商品」业务域需要的 store 能力按职责分组集中导出，调用方只需
 * `import { ... } from '~/background/store'` 即可拿到所有仓库方法。
 *
 * 已删除的 product-audit / rule / license 域相关导出不再暴露。
 */
export type { AddLogFn } from '../shared/types';
export type { StoreSchema } from './store/core';

export {
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
  clearModuleLogs,
  createScopedModuleLog,
  getModuleLogs,
  onModuleLog,
} from './store/log-repository';

export {
  getProductSources,
  removeProductSource,
  setProductSources,
} from './store/product-source-repository';
