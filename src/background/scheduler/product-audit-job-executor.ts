import type { ProductAuditTaskConfig } from '../../shared/types';
import { runProductAuditCycle } from '../modules/product-audit-cycle';
import { createScopedProductAuditLog } from '../store/log-repository';
import { getProductAuditFailurePolicy, getStatusRules } from '../store/rule-repository';
import { getListingClient } from '../wxshop/client-registry';
import { registerScheduledJobExecutor } from './scheduler-center';

export function registerProductAuditScheduledJobs(): void {
  registerScheduledJobExecutor('productAudit.submitDrafts', async ({ job, accountId, runId }) => {
    const targetAccountId = accountId || (job.scope === 'account' ? job.accountId : undefined);
    if (!targetAccountId) throw new Error('缺少账号 ID');

    const api = await getListingClient(targetAccountId);
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

    const configured = job.payload as ProductAuditTaskConfig;
    const configuredQuantity = configured.submitLimit || quota.quota;
    const submitLimit = Math.min(configuredQuantity, quota.quota);

    const failurePolicy = await getProductAuditFailurePolicy();
    const result = await runProductAuditCycle({
      api,
      addLog: createScopedProductAuditLog(targetAccountId),
      config: { ...configured, submitLimit },
      runId,
      accountId: targetAccountId,
      failureRules: failurePolicy.rules,
      defaultFailureAction: failurePolicy.defaultAction,
      statusRules: await getStatusRules(),
    });

    return {
      listed: result.submitted,
      status: result.stopped || result.errors > 0 ? 'failed' as const : 'completed' as const,
      message: result.stopped || result.errors > 0 ? null : result.reason || '商品提审任务执行完成',
      error: result.stopped || result.errors > 0 ? result.reason || '商品提审任务执行失败' : null,
      completed: false,
    };
  });
}
