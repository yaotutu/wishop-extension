export type GlobalLogLevel = 'info' | 'success' | 'warning' | 'error';
export type GlobalLogModule = 'listing' | 'violation' | 'orders' | 'store' | 'scheduler' | 'system';
export type GlobalLogScope = 'global' | 'account';
export type GlobalLogEventType = 'started' | 'completed' | 'skipped' | 'failed';
export type GlobalLogTaskKind = 'manual' | 'scheduled' | 'globalScheduled' | 'background';

export interface GlobalLogSummary {
  scanned?: number;
  listed?: number;
  deleted?: number;
  skipped?: number;
  errors?: number;
}

export interface GlobalLogError {
  code?: number;
  message: string;
}

export interface GlobalLogEntry {
  id: string;
  timestamp: number;
  module: GlobalLogModule;
  eventType: GlobalLogEventType;
  level: GlobalLogLevel;
  scope: GlobalLogScope;
  accountId?: string;
  accountName?: string;
  taskId?: string;
  taskName?: string;
  taskKind?: GlobalLogTaskKind;
  runId?: string;
  title: string;
  detail?: string;
  summary?: GlobalLogSummary;
  error?: GlobalLogError;
  metadata?: Record<string, string | number | boolean | null>;
}

export type GlobalLogInput = Omit<GlobalLogEntry, 'id' | 'timestamp'>;
