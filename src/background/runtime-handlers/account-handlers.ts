/**
 * 账号管理 IPC handler。
 *
 * 负责维护账号列表（add/remove/update/list/getActive/setActive）和单个账号的微信小店配置
 * （getConfig/setConfig）。账号被删/配置变更时主动清掉 wxshop 客户端缓存。
 *
 * 历史上这里还会停/启所有定时任务、清配额缓存；定时任务相关已经随调度域整体删除。
 */
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
import { removeWxShopClients } from '../wxshop/client-registry';
import { getAccessToken, removeAccessToken } from '../wxshop/access-token-service';
import type { RuntimeHandlerMap } from '../router/runtime-router';

interface AccountHandlerDeps {
  /**
   * 账号被删后通知调用方。当前 product-copy-only 不再需要清 draft 分页（draft 域已删），
   * 保留钩子以备后续扩展。
   */
  onAccountRemoved?: (accountId: string) => void;
}

export function createAccountRuntimeHandlers(deps: AccountHandlerDeps = {}): RuntimeHandlerMap {
  return {
    async 'accounts:list'() {
      return getAccounts();
    },
    async 'accounts:add'(args) {
      const account = await addAccount(args[0] as string, args[1] as Config);
      return account;
    },
    async 'accounts:remove'(args) {
      const accountId = args[0] as string;
      await removeAccount(accountId);
      removeWxShopClients(accountId);
      await removeAccessToken(accountId);
      deps.onAccountRemoved?.(accountId);
      return undefined;
    },
    async 'accounts:update'(args) {
      const [accountId, patch] = args as [string, Partial<{ name: string; config: Config }>];
      await updateAccount(accountId, patch);
      if (patch.config) {
        removeWxShopClients(accountId);
        await removeAccessToken(accountId);
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
      removeWxShopClients(accountId);
      await removeAccessToken(accountId);
      try {
        await getAccessToken(accountId, true);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  };
}
