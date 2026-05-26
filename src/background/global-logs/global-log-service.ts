import { v4 as uuidv4 } from 'uuid';
import type {
  GlobalLogEntry,
  GlobalLogEventType,
  GlobalLogInput,
  GlobalLogLevel,
  GlobalLogSummary,
} from '../../shared/global-log';
import { enqueueCloudGlobalLog } from './sinks/cloud-log-sink';
import { writeLocalGlobalLog } from './sinks/local-log-sink';
import { emitGlobalLogAdded } from './sinks/runtime-event-sink';
import { writeNotificationFromGlobalLog } from './sinks/notification-sink';

function levelForEvent(eventType: GlobalLogEventType): GlobalLogLevel {
  if (eventType === 'completed') return 'success';
  if (eventType === 'failed') return 'error';
  if (eventType === 'skipped' || eventType === 'waiting_user') return 'warning';
  return 'info';
}

function formatSummary(summary?: GlobalLogSummary): string | undefined {
  if (!summary) return undefined;
  const parts = [
    summary.scanned !== undefined ? `扫描 ${summary.scanned}` : '',
    summary.listed !== undefined ? `提审 ${summary.listed}` : '',
    summary.deleted !== undefined ? `删除 ${summary.deleted}` : '',
    summary.skipped !== undefined ? `跳过 ${summary.skipped}` : '',
    summary.errors !== undefined ? `错误 ${summary.errors}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('，') : undefined;
}

export async function recordGlobalLog(input: GlobalLogInput): Promise<GlobalLogEntry> {
  const summaryText = formatSummary(input.summary);
  const detail = [summaryText, input.detail].filter(Boolean).join('，') || undefined;
  const entry: GlobalLogEntry = {
    ...input,
    id: uuidv4(),
    timestamp: Date.now(),
    level: input.level || levelForEvent(input.eventType),
    detail,
  };

  await Promise.allSettled([
    writeLocalGlobalLog(entry),
    emitGlobalLogAdded(entry),
    writeNotificationFromGlobalLog(entry),
    enqueueCloudGlobalLog(entry),
  ]);

  return entry;
}

export async function recordTaskStarted(input: Omit<GlobalLogInput, 'eventType' | 'level'> & { level?: GlobalLogLevel }): Promise<GlobalLogEntry> {
  return recordGlobalLog({ ...input, eventType: 'started', level: input.level || 'info' });
}

export async function recordTaskQueued(input: Omit<GlobalLogInput, 'eventType' | 'level'> & { level?: GlobalLogLevel }): Promise<GlobalLogEntry> {
  return recordGlobalLog({ ...input, eventType: 'queued', level: input.level || 'info' });
}

export async function recordTaskWaitingUser(input: Omit<GlobalLogInput, 'eventType' | 'level'> & { level?: GlobalLogLevel }): Promise<GlobalLogEntry> {
  return recordGlobalLog({ ...input, eventType: 'waiting_user', level: input.level || 'warning' });
}

export async function recordTaskCompleted(input: Omit<GlobalLogInput, 'eventType' | 'level'> & { level?: GlobalLogLevel }): Promise<GlobalLogEntry> {
  return recordGlobalLog({ ...input, eventType: 'completed', level: input.level || 'success' });
}

export async function recordTaskSkipped(input: Omit<GlobalLogInput, 'eventType' | 'level'> & { level?: GlobalLogLevel }): Promise<GlobalLogEntry> {
  return recordGlobalLog({ ...input, eventType: 'skipped', level: input.level || 'warning' });
}

export async function recordTaskFailed(input: Omit<GlobalLogInput, 'eventType' | 'level'> & { level?: GlobalLogLevel }): Promise<GlobalLogEntry> {
  return recordGlobalLog({ ...input, eventType: 'failed', level: input.level || 'error' });
}
