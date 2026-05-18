import { useCallback } from 'react';
import { extensionApi } from '../shared/extension-api';
import type { StatusRule } from '../shared/types';
import { useIpcFetch } from './useIpcFetch';

// 处理规则 hook — 管理 editStatus → action 的可配置映射
// 规则为全局配置，不依赖于特定账户

export function useStatusRules() {
  const { data: rules, loading, fetch: fetchRules, setData: setRules } = useIpcFetch<StatusRule[]>(
    'global',
    useCallback(() => extensionApi.statusRules.get(), []),
    [],
  );

  const saveRules = useCallback(async (newRules: StatusRule[]): Promise<void> => {
    await extensionApi.statusRules.set(newRules);
    setRules(newRules);
  }, [setRules]);

  // 恢复默认规则
  const resetRules = useCallback(async (): Promise<void> => {
    const defaults = await extensionApi.statusRules.reset();
    setRules(defaults);
  }, [setRules]);

  return { rules, loading, fetchRules, saveRules, resetRules };
}
