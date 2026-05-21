import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extensionApi } from '../shared/extension-api';
import { queryKeys } from '../query/query-keys';

export function useSkipKeywords() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.rules.skipKeywords,
    queryFn: () => extensionApi.skipKeywords.get(),
  });
  const saveMutation = useMutation({
    mutationFn: (newKeywords: string[]) => extensionApi.skipKeywords.set(newKeywords),
    onSuccess: (_result, newKeywords) => {
      queryClient.setQueryData(queryKeys.rules.skipKeywords, newKeywords);
    },
  });

  const fetchKeywords = useCallback(async () => queryClient.fetchQuery({
    queryKey: queryKeys.rules.skipKeywords,
    queryFn: () => extensionApi.skipKeywords.get(),
  }), [queryClient]);

  const saveKeywords = useCallback(async (newKeywords: string[]): Promise<void> => {
    await saveMutation.mutateAsync(newKeywords);
  }, [saveMutation]);

  return { keywords: query.data ?? [], loading: query.isLoading, fetchKeywords, saveKeywords };
}
