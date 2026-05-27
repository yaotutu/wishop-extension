import { v4 as uuidv4 } from 'uuid';
import type {
  ActivityLogEntry,
  ActivityLogEvent,
  ActivityLogInput,
  ActivityLogLevel,
  ActivityLogSummary,
} from '../../shared/activity-log';
import { enqueueCloudActivityLog } from './sinks/cloud-log-sink.ts';
import { writeLocalActivityLog } from './sinks/local-log-sink.ts';
import { emitActivityLogAdded } from './sinks/runtime-event-sink.ts';
import { writeNotificationFromActivityLog } from './sinks/notification-sink.ts';
import { writeActivityConsoleLog } from '../logging/console-log-sink.ts';

type ActivityRecordInput = Omit<ActivityLogInput, 'event' | 'level'> & { level?: ActivityLogLevel };
export type ActivityRecorderInput = Pick<ActivityLogInput, 'title' | 'detail' | 'summary' | 'error' | 'notification' | 'metadata'> & {
  level?: ActivityLogLevel;
};

function levelForEvent(event: ActivityLogEvent): ActivityLogLevel {
  if (event === 'completed') return 'success';
  if (event === 'failed') return 'error';
  if (event === 'skipped' || event === 'waiting_user') return 'warning';
  return 'info';
}

function formatSummary(summary?: ActivityLogSummary): string | undefined {
  if (!summary) return undefined;
  const parts = [
    summary.succeeded !== undefined ? `成功 ${summary.succeeded}` : '',
    summary.failed !== undefined ? `失败 ${summary.failed}` : '',
    summary.fetched !== undefined ? `拉取 ${summary.fetched}` : '',
    summary.updated !== undefined ? `更新 ${summary.updated}` : '',
    summary.scanned !== undefined ? `扫描 ${summary.scanned}` : '',
    summary.listed !== undefined ? `提审 ${summary.listed}` : '',
    summary.deleted !== undefined ? `删除 ${summary.deleted}` : '',
    summary.skipped !== undefined ? `跳过 ${summary.skipped}` : '',
    summary.errors !== undefined ? `错误 ${summary.errors}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('，') : undefined;
}

export async function recordActivity(input: ActivityLogInput): Promise<ActivityLogEntry> {
  const summaryText = formatSummary(input.summary);
  const detail = [summaryText, input.detail].filter(Boolean).join('，') || undefined;
  const entry: ActivityLogEntry = {
    ...input,
    id: uuidv4(),
    timestamp: Date.now(),
    level: input.level || levelForEvent(input.event),
    detail,
  };

  await Promise.allSettled([
    writeActivityConsoleLog(entry),
    writeLocalActivityLog(entry),
    emitActivityLogAdded(entry),
    writeNotificationFromActivityLog(entry),
    enqueueCloudActivityLog(entry),
  ]);

  return entry;
}

export async function recordActivityStarted(input: ActivityRecordInput): Promise<ActivityLogEntry> {
  return recordActivity({ ...input, event: 'started', level: input.level || 'info' });
}

export async function recordActivityQueued(input: ActivityRecordInput): Promise<ActivityLogEntry> {
  return recordActivity({ ...input, event: 'queued', level: input.level || 'info' });
}

export async function recordActivityWaitingUser(input: ActivityRecordInput): Promise<ActivityLogEntry> {
  return recordActivity({ ...input, event: 'waiting_user', level: input.level || 'warning' });
}

export async function recordActivityCompleted(input: ActivityRecordInput): Promise<ActivityLogEntry> {
  return recordActivity({ ...input, event: 'completed', level: input.level || 'success' });
}

export async function recordActivitySkipped(input: ActivityRecordInput): Promise<ActivityLogEntry> {
  return recordActivity({ ...input, event: 'skipped', level: input.level || 'warning' });
}

export async function recordActivityFailed(input: ActivityRecordInput): Promise<ActivityLogEntry> {
  return recordActivity({ ...input, event: 'failed', level: input.level || 'error' });
}

export function createActivityRecorder(base: Omit<ActivityLogInput, 'event' | 'level' | 'title'> & { level?: ActivityLogLevel }) {
  function withBase(input: ActivityRecorderInput): ActivityRecordInput {
    return {
      ...base,
      ...input,
      metadata: {
        ...(base.metadata || {}),
        ...(input.metadata || {}),
      },
    };
  }

  return {
    started: (input: ActivityRecorderInput) => recordActivityStarted(withBase(input)),
    queued: (input: ActivityRecorderInput) => recordActivityQueued(withBase(input)),
    waitingUser: (input: ActivityRecorderInput) => recordActivityWaitingUser(withBase(input)),
    completed: (input: ActivityRecorderInput) => recordActivityCompleted(withBase(input)),
    skipped: (input: ActivityRecorderInput) => recordActivitySkipped(withBase(input)),
    failed: (input: ActivityRecorderInput) => recordActivityFailed(withBase(input)),
  };
}
