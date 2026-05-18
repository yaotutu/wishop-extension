import { useCallback } from 'react';
import { extensionApi } from '../shared/extension-api';
import type { Config } from '../shared/types';
import { useIpcFetch } from './useIpcFetch';

export function useConfig(accountId: string) {
  const { data: config, loading, fetch: fetchConfig, setData: setConfigState } = useIpcFetch<Config>(
    accountId,
    useCallback(async () => extensionApi.config.get(accountId), [accountId]),
    { appId: '', appSecret: '' },
  );

  const saveConfig = useCallback(async (newConfig: Config): Promise<{ success: boolean; error?: string }> => {
    const result = await extensionApi.config.set(accountId, newConfig);
    if (result.success) {
      setConfigState(newConfig);
    }
    return result;
  }, [accountId, setConfigState]);

  return { config, loading, fetchConfig, saveConfig };
}
