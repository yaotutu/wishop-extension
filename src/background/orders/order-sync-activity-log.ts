import type { ActivityLogTrigger } from '../../shared/activity-log';
import { createActivityRecorder } from '../activity-logs/activity-log-service.ts';
import type {
  OrderSyncActivityCompleteInput,
  OrderSyncActivityFailInput,
  OrderSyncActivityLog,
  OrderSyncActivityStartInput,
  RefreshOptions,
} from './order-sync-service.ts';

function triggerForReason(reason: NonNullable<RefreshOptions['reason']>): ActivityLogTrigger {
  return reason === 'manualRefresh' ? 'manual' : 'background';
}

function recorderFor(input: OrderSyncActivityStartInput) {
  return createActivityRecorder({
    domain: 'orders',
    scope: input.scope.type === 'all' ? 'global' : 'account',
    accountId: input.scope.type === 'account' ? input.scope.accountId : undefined,
    trigger: triggerForReason(input.reason),
    metadata: {
      reason: input.reason,
      mode: input.mode,
      accountCount: input.accountCount,
      concurrency: input.concurrency,
    },
  });
}

function startDetail(input: OrderSyncActivityStartInput): string {
  const scope = input.scope.type === 'all' ? '全部账号' : `账号 ${input.scope.accountId}`;
  return `${scope}，账号数 ${input.accountCount}，并发上限 ${input.concurrency}`;
}

function completeTitle(input: OrderSyncActivityCompleteInput): string {
  if (input.status === 'failed') return '订单刷新失败';
  if (input.status === 'partial_failed') return '订单刷新部分失败';
  return '订单刷新完成';
}

export function createOrderSyncActivityLog(): OrderSyncActivityLog {
  return {
    async started(input) {
      await recorderFor(input).started({
        title: '订单刷新开始',
        detail: startDetail(input),
      });
    },
    async completed(input) {
      const recorder = recorderFor(input);
      const summary = {
        succeeded: input.successCount,
        failed: input.failureCount,
        fetched: input.fetchedOrderCount,
        updated: input.updatedOrderCount,
      };
      if (input.status === 'failed') {
        await recorder.failed({
          title: completeTitle(input),
          summary,
          error: { message: `成功 ${input.successCount}，失败 ${input.failureCount}` },
        });
        return;
      }
      await recorder.completed({
        title: completeTitle(input),
        level: input.status === 'partial_failed' ? 'warning' : 'success',
        summary,
      });
    },
    async failed(input: OrderSyncActivityFailInput) {
      await recorderFor(input).failed({
        title: '订单刷新失败',
        error: { message: input.error },
      });
    },
  };
}
