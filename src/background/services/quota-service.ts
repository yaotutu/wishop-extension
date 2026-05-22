import type { QuotaResult } from '../../shared/types';
import { getClient } from '../wxshop/client-registry';

const QUOTA_CACHE_TTL_MS = 60_000;

interface QuotaCacheEntry {
  value: QuotaResult;
  fetchedAt: number;
}

const quotaCache = new Map<string, QuotaCacheEntry>();

export function clearQuotaCache(accountId?: string): void {
  if (accountId) {
    quotaCache.delete(accountId);
  } else {
    quotaCache.clear();
  }
}

export async function getAuditQuota(accountId: string, force = false): Promise<QuotaResult> {
  const now = Date.now();
  const cached = quotaCache.get(accountId);

  if (!force && cached && now - cached.fetchedAt < QUOTA_CACHE_TTL_MS) {
    return {
      ...cached.value,
      source: 'cache',
      fetchedAt: cached.fetchedAt,
      elapsedMs: 0,
    };
  }

  const startedAt = Date.now();
  const quota = await (await getClient(accountId)).getAuditQuota();
  const fetchedAt = Date.now();
  const value: QuotaResult = {
    ...quota,
    source: 'api',
    fetchedAt,
    elapsedMs: fetchedAt - startedAt,
  };

  quotaCache.set(accountId, { value, fetchedAt });
  return value;
}
