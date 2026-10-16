import type { ScheduledJobExecutorResult } from '../../shared/types';

export const SCHEDULED_JOB_CANCELLED_MESSAGE = '用户手动停止';

export function createCancelledScheduledJobResult(listed = 0): ScheduledJobExecutorResult {
  // 所有调度执行器都用同一份取消结果，避免“停止”在统计、日志和 UI 中出现不同状态。
  return {
    listed,
    status: 'cancelled',
    message: SCHEDULED_JOB_CANCELLED_MESSAGE,
    error: null,
    completed: false,
  };
}
