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
import { startAllTasks, stopAllTasks } from '../scheduler/listing-scheduler';
import { removeClient } from '../wxshop/client-registry';
import { createWxShopClient } from '../wxshop/client';
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
      await startAllTasks();
      return account;
    },
    async 'accounts:remove'(args) {
      const accountId = args[0] as string;
      await stopAllTasks();
      await removeAccount(accountId);
      await startAllTasks();
      removeClient(accountId);
      deps.onAccountRemoved(accountId);
      return undefined;
    },
    async 'accounts:update'(args) {
      return updateAccount(args[0] as string, args[1] as Partial<{ name: string; config: Config }>);
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
      try {
        await createWxShopClient(config).getAccessToken();
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  };
}
