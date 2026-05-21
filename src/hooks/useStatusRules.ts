import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extensionApi } from '../shared/extension-api';
import type { StatusRule } from '../shared/types';
import { queryKeys } from '../query/query-keys';

// 处理规则 hook — 管理 editStatus → action 的可配置映射
// 规则为全局配置，不依赖于特定账户

export function useStatusRules() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.rules.status,
    queryFn: () => extensionApi.statusRules.get(),
  });
  const saveMutation = useMutation({
    mutationFn: (newRules: StatusRule[]) => extensionApi.statusRules.set(newRules),
    onSuccess: (_result, newRules) => {
      queryClient.setQueryData(queryKeys.rules.status, newRules);
    },
  });
  const resetMutation = useMutation({
    mutationFn: () => extensionApi.statusRules.reset(),
    onSuccess: (defaults) => {
      queryClient.setQueryData(queryKeys.rules.status, defaults);
    },
  });

  const fetchRules = useCallback(async () => queryClient.fetchQuery({
    queryKey: queryKeys.rules.status,
    queryFn: () => extensionApi.statusRules.get(),
  }), [queryClient]);

  const saveRules = useCallback(async (newRules: StatusRule[]): Promise<void> => {
    await saveMutation.mutateAsync(newRules);
  }, [saveMutation]);

  // 恢复默认规则
  const resetRules = useCallback(async (): Promise<void> => {
    await resetMutation.mutateAsync();
  }, [resetMutation]);

  return { rules: query.data ?? [], loading: query.isLoading, fetchRules, saveRules, resetRules };
}
