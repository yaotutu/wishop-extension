import type { ScheduledJobView } from '../../shared/types';

export function formatCron(cronExpression: string): string {
  const daily = cronExpression.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
  if (daily) return `每天 ${daily[2].padStart(2, '0')}:${daily[1].padStart(2, '0')}`;

  const everyMinutes = cronExpression.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (everyMinutes) return `每 ${everyMinutes[1]} 分钟`;

  const hourly = cronExpression.match(/^(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (hourly) return `每小时第 ${hourly[1].padStart(2, '0')} 分钟`;

  return cronExpression;
}

export function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours <= 0) return `${mm}:${ss}`;
  return `${String(hours).padStart(2, '0')}:${mm}:${ss}`;
}

export function nextRunCountdownText(job: Pick<ScheduledJobView, 'enabled' | 'nextRunAt' | 'completedAt'>, now = Date.now()): string {
  if (job.completedAt != null) return '已完成';
  if (!job.enabled) return '已停用';
  if (!job.nextRunAt) return '等待调度';
  const remaining = job.nextRunAt - now;
  if (remaining <= 0) return '即将更新';
  return `${formatCountdown(remaining)} 后更新`;
}
