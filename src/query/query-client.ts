import { QueryClient } from '@tanstack/react-query';

/**
 * Frontend cache for runtime API data. Business state is still persisted by the
 * background repositories; this cache only removes duplicated loading/error
 * wiring inside React pages.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});
