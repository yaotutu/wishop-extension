import type { ActivityLogNotificationIntent } from './notification';

export type ActivityLogLevel = 'info' | 'success' | 'warning' | 'error';
export type ActivityLogDomain = 'listing' | 'violation' | 'orders' | 'store' | 'scheduler' | 'system';
export type ActivityLogScope = 'global' | 'account';
export type ActivityLogEvent = 'started' | 'queued' | 'waiting_user' | 'completed' | 'skipped' | 'failed';
export type ActivityLogTrigger = 'manual' | 'scheduled' | 'globalScheduled' | 'background';

export interface ActivityLogSummary {
  succeeded?: number;
  failed?: number;
  fetched?: number;
  updated?: number;
  scanned?: number;
  listed?: number;
  deleted?: number;
  skipped?: number;
  errors?: number;
}

export interface ActivityLogError {
  code?: number;
  message: string;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  domain: ActivityLogDomain;
  event: ActivityLogEvent;
  level: ActivityLogLevel;
  scope: ActivityLogScope;
  accountId?: string;
  accountName?: string;
  taskId?: string;
  taskName?: string;
  trigger?: ActivityLogTrigger;
  runId?: string;
  title: string;
  detail?: string;
  summary?: ActivityLogSummary;
  error?: ActivityLogError;
  notification?: ActivityLogNotificationIntent;
  metadata?: Record<string, string | number | boolean | null>;
}

export type ActivityLogInput = Omit<ActivityLogEntry, 'id' | 'timestamp'>;
