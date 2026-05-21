import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extensionApi } from '../shared/extension-api';
import type { Config, Account } from '../shared/types';
import { queryKeys } from '../query/query-keys';

const EMPTY_ACCOUNTS: Account[] = [];

export function useAccounts() {
  const queryClient = useQueryClient();
  const [activeAccountId, setActiveAccountIdState] = useState<string>('');

  const accountsQuery = useQuery({
    queryKey: queryKeys.accounts.list,
    queryFn: () => extensionApi.accounts.list(),
  });
  const activeAccountQuery = useQuery({
    queryKey: queryKeys.accounts.active,
    queryFn: () => extensionApi.accounts.getActive(),
  });

  const accounts = accountsQuery.data ?? EMPTY_ACCOUNTS;

  useEffect(() => {
    const persisted = activeAccountQuery.data;
    if (persisted && accounts.some(account => account.id === persisted)) {
      setActiveAccountIdState(persisted);
      return;
    }
    setActiveAccountIdState(prev => (
      prev && accounts.some(account => account.id === prev)
        ? prev
        : accounts[0]?.id || ''
    ));
  }, [accounts, activeAccountQuery.data]);

  const fetchAccounts = useCallback(async () => {
    const [list, active] = await Promise.all([
      extensionApi.accounts.list(),
      extensionApi.accounts.getActive().catch(() => ''),
    ]);
    queryClient.setQueryData(queryKeys.accounts.list, list);
    queryClient.setQueryData(queryKeys.accounts.active, active);
    setActiveAccountIdState(active || list[0]?.id || '');
    return list;
  }, [queryClient]);

  const addMutation = useMutation({
    mutationFn: ({ name, config }: { name: string; config: Config }) => extensionApi.accounts.add(name, config),
    onSuccess: (account) => {
      queryClient.setQueryData<Account[]>(queryKeys.accounts.list, (current = []) => [...current, account]);
    },
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => extensionApi.accounts.remove(id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<Account[]>(queryKeys.accounts.list, (current = []) => current.filter(account => account.id !== id));
      void queryClient.invalidateQueries({ queryKey: queryKeys.accounts.active });
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<Account, 'name' | 'config'>> }) => extensionApi.accounts.update(id, patch),
    onSuccess: (_result, { id, patch }) => {
      queryClient.setQueryData<Account[]>(queryKeys.accounts.list, (current = []) =>
        current.map(account => account.id === id ? { ...account, ...patch } : account),
      );
    },
  });
  const switchMutation = useMutation({
    mutationFn: (id: string) => extensionApi.accounts.setActive(id),
    onSuccess: (_result, id) => {
      setActiveAccountIdState(id);
      queryClient.setQueryData(queryKeys.accounts.active, id);
    },
  });

  const addAccount = useCallback(async (name: string, config: Config): Promise<Account> => {
    return addMutation.mutateAsync({ name, config });
  }, [addMutation]);

  const removeAccount = useCallback(async (id: string) => {
    await removeMutation.mutateAsync(id);
    await fetchAccounts();
  }, [fetchAccounts, removeMutation]);

  const updateAccount = useCallback(async (id: string, patch: Partial<Pick<Account, 'name' | 'config'>>) => {
    await updateMutation.mutateAsync({ id, patch });
  }, [updateMutation]);

  const switchAccount = useCallback(async (id: string) => {
    await switchMutation.mutateAsync(id);
  }, [switchMutation]);

  return {
    accounts,
    activeAccountId,
    loading: accountsQuery.isLoading || activeAccountQuery.isLoading,
    fetchAccounts,
    addAccount,
    removeAccount,
    updateAccount,
    switchAccount,
  };
}
