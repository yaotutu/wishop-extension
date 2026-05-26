import type { Config } from '../../shared/types';
import {
  addAccount,
  getAccounts,
  getActiveAccountId,
  getConfig,
  removeAccount,
  setActiveAccountId,
  setConfig,
  updateAccount,
} from '../store/account-repository';
import { removeScheduledJobsForAccount } from '../store/scheduled-job-repository';
import { startAllScheduledJobs, stopAllScheduledJobs } from '../scheduler/scheduler-center';
import { removeClient } from '../wxshop/client-registry';
import { getAccessToken, removeAccessToken } from '../wxshop/access-token-service';
import { clearQuotaCache } from '../services/quota-service';
import type { RuntimeHandlerMap } from '../router/runtime-router';

interface AccountHandlerDeps {
  onAccountRemoved: (accountId: string) => void;
}

export function createAccountRuntimeHandlers(deps: AccountHandlerDeps): RuntimeHandlerMap {
  return {
    async 'accounts:list'() {
      return getAccounts();
    },
    async 'accounts:add'(args) {
      const account = await addAccount(args[0] as string, args[1] as Config);
      await startAllScheduledJobs();
      return account;
    },
    async 'accounts:remove'(args) {
      const accountId = args[0] as string;
      await stopAllScheduledJobs();
      await removeScheduledJobsForAccount(accountId);
      await removeAccount(accountId);
      await startAllScheduledJobs();
      removeClient(accountId);
      await removeAccessToken(accountId);
      clearQuotaCache(accountId);
      deps.onAccountRemoved(accountId);
      return undefined;
    },
    async 'accounts:update'(args) {
      const [accountId, patch] = args as [string, Partial<{ name: string; config: Config }>];
      await updateAccount(accountId, patch);
      if (patch.config) {
        removeClient(accountId);
        await removeAccessToken(accountId);
        clearQuotaCache(accountId);
      }
      return undefined;
    },
    async 'accounts:getActive'() {
      return getActiveAccountId();
    },
    async 'accounts:setActive'(args) {
      return setActiveAccountId(args[0] as string);
    },
    async 'config:get'(args) {
      return getConfig(args[0] as string);
    },
    async 'config:set'(args) {
      const [accountId, config] = args as [string, Config];
      await setConfig(accountId, config);
      removeClient(accountId);
      await removeAccessToken(accountId);
      clearQuotaCache(accountId);
      try {
        await getAccessToken(accountId, true);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  };
}
