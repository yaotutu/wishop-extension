import type { SyncWxCategoryProductRulesInput } from '../../shared/types.ts';
import type { RuntimeHandlerMap } from '../router/runtime-router.ts';
import {
  getWxCategoryProductRuleCacheStatus,
  startWxCategoryProductRuleCacheSync,
} from '../services/wx-category-product-rule-cache-service.ts';

export function createWxCategoryDataRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'wxCategoryData:downloadProductRules'(args) {
      return startWxCategoryProductRuleCacheSync(args[0] as SyncWxCategoryProductRulesInput);
    },
    async 'wxCategoryData:getProductRuleCacheStatus'() {
      return getWxCategoryProductRuleCacheStatus();
    },
  };
}
