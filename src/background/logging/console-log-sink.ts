import type { ActivityLogEntry, ActivityLogLevel } from '../../shared/activity-log';

export type ConsoleLogMethod = 'info' | 'warn' | 'error';

export interface ConsoleLogPayload {
  method: ConsoleLogMethod;
  args: unknown[];
}

function methodForLevel(level: ActivityLogLevel): ConsoleLogMethod {
  if (level === 'error') return 'error';
  if (level === 'warning') return 'warn';
  return 'info';
}

export function formatActivityConsoleLog(entry: ActivityLogEntry): ConsoleLogPayload {
  const scope = entry.scope === 'account' && entry.accountId
    ? `account:${entry.accountId}`
    : entry.scope;
  return {
    method: methodForLevel(entry.level),
    args: [
      `[activity:${entry.domain}:${scope}]`,
      {
        event: entry.event,
        trigger: entry.trigger,
        title: entry.title,
        detail: entry.detail,
        accountId: entry.accountId,
        accountName: entry.accountName,
        runId: entry.runId,
        summary: entry.summary,
        error: entry.error,
        metadata: entry.metadata,
      },
    ],
  };
}

export function writeConsoleLog(payload: ConsoleLogPayload): void {
  console[payload.method](...payload.args);
}

export async function writeActivityConsoleLog(entry: ActivityLogEntry): Promise<void> {
  writeConsoleLog(formatActivityConsoleLog(entry));
}
