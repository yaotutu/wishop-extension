import type { ProductAuditTaskConfig, ProductAuditTaskResult } from '../../shared/types';
import { recordActivityCompleted, recordActivityFailed, recordActivityStarted } from '../activity-logs/activity-log-service.ts';
import { runProductAuditCycle } from '../modules/product-audit-cycle';
import { getAccount } from '../store/account-repository';
import { createScopedProductAuditLog } from '../store/log-repository';
import { getProductAuditFailurePolicy, getStatusRules } from '../store/rule-repository';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';
import type { SessionManager } from '../utils/session-manager';
import { getListingClient } from '../wxshop/client-registry';

export async function runProductAuditTask(
  accountId: string,
  config: ProductAuditTaskConfig,
  taskSessions: SessionManager<void>,
): Promise<ProductAuditTaskResult> {
  const logger = createDiagnosticLogger({ domain: 'productAudit', component: 'ProductAuditTask', accountId });
  const runId = Date.now().toString();
  const addLog = createScopedProductAuditLog(accountId);
  const account = await getAccount(accountId);

  await recordActivityStarted({
    domain: 'productAudit',
    scope: 'account',
    accountId,
    accountName: account?.name,
    trigger: 'manual',
    runId,
    title: '单账号手动提审开始',
    detail: `账号「${account?.name || accountId}」开始执行单账号手动提审任务`,
  });

  if (config.submitUnauditedDrafts) {
    try {
      const quota = await (await getListingClient(accountId)).getAuditQuota();
      logger.info(`配额检查: 剩余 ${quota.quota} / 总共 ${quota.total}`);
      addLog({
        runId,
        productId: '',
        productTitle: `今日提审配额: 剩余${quota.quota}/${quota.total}`,
        action: 'check',
        status: quota.quota > 0 ? 'success' : 'failed',
      });
      config = { ...config, submitLimit: quota.quota };
    } catch (error: any) {
      const message = `配额检查失败: ${error?.message || String(error)}`;
      addLog({ runId, productId: '', productTitle: '', action: 'check', status: 'failed', errorMsg: message });
      await recordActivityFailed({
        domain: 'productAudit',
        scope: 'account',
        accountId,
        accountName: account?.name,
        trigger: 'manual',
        runId,
        title: '单账号手动提审失败',
        error: { message },
        notification: {
          topic: 'productAudit.audit_failed',
          urgency: 'important',
        },
      });
      logger.error('配额检查失败:', error);
      return { scanned: 0, submitted: 0, kept: 0, deleted: 0, errors: 0, skipped: 0, stopped: true, reason: message };
    }
  }

  const signal = taskSessions.start(accountId, undefined);
  try {
    const failurePolicy = await getProductAuditFailurePolicy();
    const result = await runProductAuditCycle({
      api: await getListingClient(accountId),
      addLog,
      config,
      runId,
      signal,
      accountId,
      failureRules: failurePolicy.rules,
      defaultFailureAction: failurePolicy.defaultAction,
      statusRules: await getStatusRules(),
    });
    await recordActivityCompleted({
      domain: 'productAudit',
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
          topic: 'productAudit.audit_warning' as const,
          urgency: 'normal' as const,
        },
      } : {}),
      summary: {
        scanned: result.scanned,
        listed: result.submitted,
        deleted: result.deleted,
        skipped: result.skipped,
        errors: result.errors,
      },
    });
    return result;
  } catch (error: any) {
    await recordActivityFailed({
      domain: 'productAudit',
      scope: 'account',
      accountId,
      accountName: account?.name,
      trigger: 'manual',
      runId,
      title: '单账号手动提审异常',
      error: { message: error?.message || String(error) },
      notification: {
        topic: 'productAudit.audit_failed',
        urgency: 'important',
      },
    });
    throw error;
  } finally {
    taskSessions.complete(accountId);
  }
}
