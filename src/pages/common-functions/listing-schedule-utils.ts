import type { ScheduledJob } from '../../shared/types';

export const cronPresets = [
  { label: '每天 6:00', value: '0 6 * * *' },
  { label: '每天 9:00', value: '0 9 * * *' },
  { label: '每天 12:00', value: '0 12 * * *' },
  { label: '每天 14:00', value: '0 14 * * *' },
  { label: '每天 18:00', value: '0 18 * * *' },
  { label: '每天 21:00', value: '0 21 * * *' },
  { label: '每 2 小时', value: '0 */2 * * *' },
  { label: '每 4 小时', value: '0 */4 * * *' },
];

export function cronToLabel(cron: string): string {
  const preset = cronPresets.find(p => p.value === cron);
  if (preset) return preset.label;
  const m = cron.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
  if (m) return `每天 ${m[2]}:${m[1].padStart(2, '0')}`;
  return cron;
}

export function cronToMinuteOfDay(cron: string): number | null {
  const m = cron.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
  if (!m) return null;
  return Number(m[2]) * 60 + Number(m[1]);
}

export function cronToTimeInput(cron: string): string {
  const m = cron.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
  if (!m) return '';
  return `${m[2].padStart(2, '0')}:${m[1].padStart(2, '0')}`;
}

export function timeInputToCron(value: string): string | null {
  const match = value.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${minute} ${hour} * * *`;
}

export function formatMinuteOfDay(totalMinutes: number): string {
  const dayOffset = Math.floor(totalMinutes / 1440);
  const minutes = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const label = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return dayOffset > 0 ? `次日 ${label}` : label;
}

export function getGlobalTaskWindowLabel(
  task: Pick<ScheduledJob, 'cronExpression' | 'staggerMinutes'>,
  accountCount: number,
): string {
  const start = cronToMinuteOfDay(task.cronExpression);
  if (start == null) return cronToLabel(task.cronExpression);
  if (accountCount <= 1) return formatMinuteOfDay(start);
  return `${formatMinuteOfDay(start)} - ${formatMinuteOfDay(start + (accountCount - 1) * (task.staggerMinutes || 0))}`;
}
