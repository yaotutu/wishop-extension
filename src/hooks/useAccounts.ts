import { useState, useCallback } from 'react';
import { extensionApi } from '../shared/extension-api';
import type { Config, Account } from '../shared/types';

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccountId, setActiveAccountIdState] = useState<string>('');

  const fetchAccounts = useCallback(async () => {
    const list = await extensionApi.accounts.list();
    setAccounts(list);
    setActiveAccountIdState(prev => prev || list[0]?.id || '');
  }, []);

  const addAccount = useCallback(async (name: string, config: Config): Promise<Account> => {
    const account = await extensionApi.accounts.add(name, config);
    await fetchAccounts();
    return account;
  }, [fetchAccounts]);

  const removeAccount = useCallback(async (id: string) => {
    await extensionApi.accounts.remove(id);
    await fetchAccounts();
  }, [fetchAccounts]);

  const updateAccount = useCallback(async (id: string, patch: Partial<Pick<Account, 'name' | 'config'>>) => {
    await extensionApi.accounts.update(id, patch);
    await fetchAccounts();
  }, [fetchAccounts]);

  const switchAccount = useCallback(async (id: string) => {
    await extensionApi.accounts.setActive(id);
    setActiveAccountIdState(id);
  }, []);

  return { accounts, activeAccountId, fetchAccounts, addAccount, removeAccount, updateAccount, switchAccount };
}
