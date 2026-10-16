import type { StatusRule } from '../../shared/types';
import {
  getDefaultStatusRules,
  getStatusRules,
  setStatusRules,
} from '../store/rule-repository';
import type { RuntimeHandlerMap } from '../router/runtime-router';

export function createRuleRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'statusRules:get'() {
      return getStatusRules();
    },
    async 'statusRules:set'(args) {
      return setStatusRules(args[0] as StatusRule[]);
    },
    async 'statusRules:reset'() {
      const defaults = getDefaultStatusRules();
      await setStatusRules(defaults);
      return defaults;
    },
  };
}
