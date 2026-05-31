import type { TaskConfig } from '../../shared/types';
import { runTaskCycle } from '../modules/task-cycle';
import { createScopedListingLog } from '../store/log-repository';
import { getBlacklistRules, getSkipKeywords, getStatusRules } from '../store/rule-repository';
import { getClient } from '../wxshop/client-registry';
import { registerScheduledJobExecutor } from './scheduler-center';

export function registerListingScheduledJobs(): void {
  registerScheduledJobExecutor('listing.submitDrafts', async ({ job, accountId, runId }) => {
    const targetAccountId = accountId || (job.scope === 'account' ? job.accountId : undefined);
    if (!targetAccountId) throw new Error('缺少账号 ID');

    const api = await getClient(targetAccountId);
    const quota = await api.getAuditQuota();
    if (quota.quota <= 0) {
      return {
        listed: 0,
        status: 'skipped' as const,
        message: null,
        error: '今日提审配额已用完',
        completed: false,
      };
    }

    const configured = job.payload as TaskConfig;
    const configuredQuantity = configured.listUnreviewedQuantity || quota.quota;
    const listUnreviewedQuantity = Math.min(configuredQuantity, quota.quota);

    const result = await runTaskCycle(
      api,
      createScopedListingLog(targetAccountId),
      { ...configured, listUnreviewedQuantity },
      runId,
      undefined,
      targetAccountId,
      await getBlacklistRules(),
      await getSkipKeywords(),
      await getStatusRules(),
    );

    return {
      listed: result.listed,
      status: result.stopped || result.errors > 0 ? 'failed' as const : 'completed' as const,
      message: result.stopped || result.errors > 0 ? null : result.reason || '商品提审任务执行完成',
      error: result.stopped || result.errors > 0 ? result.reason || '商品提审任务执行失败' : null,
      completed: false,
    };
  });
}
