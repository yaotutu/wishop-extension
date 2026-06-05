import type { ProductAuditCategoryPrecheckInput, ProductAuditFailurePolicy, ProductAuditTaskConfig } from '../../shared/types';
import type { RuntimeHandlerMap } from '../router/runtime-router';
import { precheckCategoryForProductAudit } from '../services/product-audit-precheck-service.ts';
import { getProductAuditConfig, setProductAuditConfig } from '../store/product-audit-config-repository';
import {
  getDefaultProductAuditFailurePolicy,
  getProductAuditFailurePolicy,
  setProductAuditFailurePolicy,
} from '../store/rule-repository';
import { clearProductAuditLogs, getProductAuditLogs } from '../store/log-repository';

interface ProductAuditHandlerDeps {
  run: (accountId: string, config: ProductAuditTaskConfig) => Promise<unknown>;
  stop: (accountId: string) => void;
}

export function createProductAuditRuntimeHandlers(deps: ProductAuditHandlerDeps): RuntimeHandlerMap {
  return {
    async 'productAudit:configGet'(args) {
      return getProductAuditConfig(args[0] as string);
    },
    async 'productAudit:configSet'(args) {
      return setProductAuditConfig(args[0] as string, args[1] as ProductAuditTaskConfig);
    },
    async 'productAudit:run'(args) {
      return deps.run(args[0] as string, args[1] as ProductAuditTaskConfig);
    },
    async 'productAudit:stop'(args) {
      deps.stop(args[0] as string);
      return undefined;
    },
    async 'productAudit:precheckCategory'(args) {
      return precheckCategoryForProductAudit(args[0] as ProductAuditCategoryPrecheckInput);
    },
    async 'productAudit:logsGet'(args) {
      return getProductAuditLogs(args[0] as string);
    },
    async 'productAudit:logsClear'(args) {
      return clearProductAuditLogs(args[0] as string);
    },
    async 'productAudit:failurePolicyGet'() {
      return getProductAuditFailurePolicy();
    },
    async 'productAudit:failurePolicyGetDefaults'() {
      return getDefaultProductAuditFailurePolicy();
    },
    async 'productAudit:failurePolicySet'(args) {
      return setProductAuditFailurePolicy(args[0] as ProductAuditFailurePolicy);
    },
  };
}
