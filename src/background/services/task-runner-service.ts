import type { TaskConfig, TaskCycleResult } from '../../shared/types';
import { recordActivityCompleted, recordActivityFailed, recordActivityStarted } from '../activity-logs/activity-log-service.ts';
import { runTaskCycle } from '../modules/task-cycle';
import { getAccount } from '../store/account-repository';
import { createScopedListingLog } from '../store/log-repository';
import { getBlacklistRules, getSkipKeywords, getStatusRules } from '../store/rule-repository';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';
import type { SessionManager } from '../utils/session-manager';
import { getClient } from '../wxshop/client-registry';

export async function runTask(accountId: string, taskConfig: TaskConfig, taskSessions: SessionManager<void>): Promise<TaskCycleResult> {
  const logger = createDiagnosticLogger({ domain: 'listing', component: 'TaskRun', accountId });
  const runId = Date.now().toString();
  const addLog = createScopedListingLog(accountId);
  const account = await getAccount(accountId);

  await recordActivityStarted({
    domain: 'listing',
    scope: 'account',
    accountId,
    accountName: account?.name,
    trigger: 'manual',
    runId,
    title: '单账号手动提审开始',
    detail: `账号「${account?.name || accountId}」开始执行单账号手动提审任务`,
  });

  if (taskConfig.listUnreviewed) {
    try {
      const quota = await (await getClient(accountId)).getAuditQuota();
      logger.info(`配额检查: 剩余 ${quota.quota} / 总共 ${quota.total}`);
      addLog({ runId, productId: '', productTitle: `今日提审配额: 剩余${quota.quota}/${quota.total}`, action: 'check', status: quota.quota > 0 ? 'success' : 'failed' });
      taskConfig = { ...taskConfig, listUnreviewedQuantity: quota.quota };
    } catch (error: any) {
      addLog({ runId, productId: '', productTitle: '', action: 'check', status: 'failed', errorMsg: `配额检查失败: ${error.message}` });
      await recordActivityFailed({
        domain: 'listing',
        scope: 'account',
        accountId,
        accountName: account?.name,
        trigger: 'manual',
        runId,
        title: '单账号手动提审失败',
        error: { message: `配额检查失败: ${error.message}` },
        notification: {
          topic: 'listing.audit_failed',
          urgency: 'important',
        },
      });
      logger.error('配额检查失败:', error);
      return { scanned: 0, deleted: 0, listed: 0, errors: 0, skipped: 0, stopped: true, reason: `配额检查失败: ${error.message}` };
    }
  }

  const signal = taskSessions.start(accountId, undefined);
  try {
    const result = await runTaskCycle(
      await getClient(accountId),
      addLog,
      taskConfig,
      runId,
      signal,
      accountId,
      await getBlacklistRules(),
      await getSkipKeywords(),
      await getStatusRules(),
    );
    await recordActivityCompleted({
      domain: 'listing',
      scope: 'account',
      accountId,
      accountName: account?.name,
      trigger: 'manual',
      runId,
      level: result.stopped || result.errors > 0 ? 'warning' : 'success',
      title: '单账号手动提审完成',
      detail: result.reason ? `原因：${result.reason}` : undefined,
      ...(result.stopped || result.errors > 0 ? {
        notification: {
          topic: 'listing.audit_warning' as const,
          urgency: 'normal' as const,
        },
      } : {}),
      summary: {
        scanned: result.scanned,
        listed: result.listed,
        deleted: result.deleted,
        skipped: result.skipped,
        errors: result.errors,
      },
    });
    return result;
  } catch (error: any) {
    await recordActivityFailed({
      domain: 'listing',
      scope: 'account',
      accountId,
      accountName: account?.name,
      trigger: 'manual',
      runId,
      title: '单账号手动提审异常',
      error: { message: error?.message || String(error) },
      notification: {
        topic: 'listing.audit_failed',
        urgency: 'important',
      },
    });
    throw error;
  } finally {
    taskSessions.complete(accountId);
  }
}
