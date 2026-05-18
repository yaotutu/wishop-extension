import { useCallback } from 'react';
import { extensionApi } from '../shared/extension-api';
import { useIpcFetch } from './useIpcFetch';

export function useSkipKeywords() {
  const { data: keywords, loading, fetch: fetchKeywords, setData: setKeywords } = useIpcFetch<string[]>(
    'global',
    useCallback(() => extensionApi.skipKeywords.get(), []),
    [],
  );

  const saveKeywords = useCallback(async (newKeywords: string[]): Promise<void> => {
    await extensionApi.skipKeywords.set(newKeywords);
    setKeywords(newKeywords);
  }, [setKeywords]);

  return { keywords, loading, fetchKeywords, saveKeywords };
}
