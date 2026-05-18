import { useState, useCallback, useEffect } from 'react';
import { extensionApi } from '../shared/extension-api';
import type { BlacklistRule } from '../shared/types';
import { useIpcFetch } from './useIpcFetch';

export function useBlacklistRules() {
  const { data: rules, loading, fetch: fetchRules, setData: setRules } = useIpcFetch<BlacklistRule[]>(
    'global',
    useCallback(() => extensionApi.blacklistRules.get(), []),
    [],
  );

  const [defaultCodes, setDefaultCodes] = useState<Set<number>>(new Set());

  useEffect(() => {
    extensionApi.blacklistRules.getDefaultCodes().then((codes: number[]) => {
      setDefaultCodes(new Set(codes));
    });
  }, []);

  const saveRules = useCallback(async (newRules: BlacklistRule[]): Promise<void> => {
    await extensionApi.blacklistRules.set(newRules);
    setRules(newRules);
  }, [setRules]);

  return { rules, loading, fetchRules, saveRules, defaultCodes };
}
