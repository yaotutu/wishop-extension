import type { GlobalLogEntry, GlobalLogEventType, GlobalLogLevel, GlobalLogModule } from './global-log';

export type NotificationChannel = 'inApp';
export type NotificationDeliveryStatus = 'created' | 'delivered' | 'read';

export interface NotificationEntry {
  id: string;
  sourceLogId: string;
  timestamp: number;
  channel: NotificationChannel;
  deliveryStatus: NotificationDeliveryStatus;
  level: GlobalLogLevel;
  module: GlobalLogModule;
  eventType: GlobalLogEventType;
  title: string;
  detail?: string;
  errorMessage?: string;
  accountId?: string;
  accountName?: string;
  taskKind?: GlobalLogEntry['taskKind'];
  runId?: string;
  readAt?: number;
  metadata?: GlobalLogEntry['metadata'];
}

export interface NotificationPreference {
  inAppEnabled: boolean;
  levelEnabled: Record<GlobalLogLevel, boolean>;
  moduleEnabled: Record<GlobalLogModule, boolean>;
  eventTypeEnabled: Record<GlobalLogEventType, boolean>;
}

export const DEFAULT_NOTIFICATION_PREFERENCE: NotificationPreference = {
  inAppEnabled: true,
  levelEnabled: {
    error: true,
    warning: true,
    success: false,
    info: false,
  },
  moduleEnabled: {
    listing: true,
    violation: true,
    orders: true,
    store: true,
    scheduler: true,
    system: true,
  },
  eventTypeEnabled: {
    failed: true,
    waiting_user: true,
    queued: false,
    skipped: true,
    completed: false,
    started: false,
  },
};
