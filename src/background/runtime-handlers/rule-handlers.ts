import type { BlacklistRule, StatusRule } from '../../shared/types';
import {
  getBlacklistRules,
  getDefaultBlacklistCodes,
  getDefaultStatusRules,
  getSkipKeywords,
  getStatusRules,
  setBlacklistRules,
  setSkipKeywords,
  setStatusRules,
} from '../store/rule-repository';
import type { RuntimeHandlerMap } from '../router/runtime-router';

export function createRuleRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'blacklistRules:get'() {
      return getBlacklistRules();
    },
    async 'blacklistRules:getDefaultCodes'() {
      return getDefaultBlacklistCodes();
    },
    async 'blacklistRules:set'(args) {
      return setBlacklistRules(args[0] as BlacklistRule[]);
    },
    async 'skipKeywords:get'() {
      return getSkipKeywords();
    },
    async 'skipKeywords:set'(args) {
      return setSkipKeywords(args[0] as string[]);
    },
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
