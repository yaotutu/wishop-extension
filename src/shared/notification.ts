import type { GlobalLogEntry, GlobalLogEventType, GlobalLogLevel, GlobalLogModule } from './global-log';

export type NotificationChannel = 'inApp';
export type NotificationDeliveryStatus = 'created' | 'delivered' | 'read';
export type NotificationUrgency = 'silent' | 'normal' | 'important';

export type NotificationTopic =
  | 'taobao.security_challenge'
  | 'orders.shipment_failed'
  | 'orders.purchase_lookup_failed'
  | 'orders.refund_failed'
  | 'listing.audit_failed'
  | 'listing.audit_warning'
  | 'scheduled_job.failed'
  | 'system.credential_invalid';

export interface GlobalLogNotificationIntent {
  topic: NotificationTopic;
  urgency?: NotificationUrgency;
  title?: string;
  detail?: string;
}

export interface NotificationEntry {
  id: string;
  sourceLogId: string;
  topic: NotificationTopic;
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
  topicEnabled: Record<NotificationTopic, boolean>;
  moduleEnabled: Record<GlobalLogModule, boolean>;
}

export const DEFAULT_NOTIFICATION_PREFERENCE: NotificationPreference = {
  inAppEnabled: true,
  topicEnabled: {
    'taobao.security_challenge': true,
    'orders.shipment_failed': true,
    'orders.purchase_lookup_failed': true,
    'orders.refund_failed': true,
    'listing.audit_failed': true,
    'listing.audit_warning': true,
    'scheduled_job.failed': true,
    'system.credential_invalid': true,
  },
  moduleEnabled: {
    listing: true,
    violation: true,
    orders: true,
    store: true,
    scheduler: true,
    system: true,
  },
};

export interface NotificationTopicDefinition {
  topic: NotificationTopic;
  module: GlobalLogModule;
  label: string;
  description: string;
  defaultUrgency: NotificationUrgency;
}

export const NOTIFICATION_TOPIC_DEFINITIONS: NotificationTopicDefinition[] = [
  {
    topic: 'taobao.security_challenge',
    module: 'orders',
    label: '淘宝/天猫需要处理',
    description: '工作页遇到登录、安全验证、访问受限等需要人工处理的情况。',
    defaultUrgency: 'important',
  },
  {
    topic: 'orders.shipment_failed',
    module: 'orders',
    label: '订单发货失败',
    description: '微信小店发货回填失败、快递公司匹配失败或接口提交失败。',
    defaultUrgency: 'important',
  },
  {
    topic: 'orders.purchase_lookup_failed',
    module: 'orders',
    label: '淘宝订单读取失败',
    description: '读取淘宝订单状态、物流或采购信息失败。',
    defaultUrgency: 'important',
  },
  {
    topic: 'orders.refund_failed',
    module: 'orders',
    label: '退款申请失败',
    description: '淘宝退款申请页准备或自动提交失败。',
    defaultUrgency: 'important',
  },
  {
    topic: 'listing.audit_failed',
    module: 'listing',
    label: '商品提审失败',
    description: '手动或定时商品提审任务失败。',
    defaultUrgency: 'important',
  },
  {
    topic: 'listing.audit_warning',
    module: 'listing',
    label: '商品提审异常摘要',
    description: '商品提审完成但存在跳过、错误、停止或配额异常。',
    defaultUrgency: 'normal',
  },
  {
    topic: 'scheduled_job.failed',
    module: 'scheduler',
    label: '定时任务失败',
    description: '调度中心执行定时任务失败。',
    defaultUrgency: 'important',
  },
  {
    topic: 'system.credential_invalid',
    module: 'system',
    label: '店铺凭证失效',
    description: '店铺授权、AppSecret 或接口凭证不可用。',
    defaultUrgency: 'important',
  },
];
