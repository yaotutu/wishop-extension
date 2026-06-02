import type { ActivityLogDomain, ActivityLogEntry, ActivityLogEvent, ActivityLogLevel } from './activity-log';

export type NotificationChannel = 'inApp';
export type NotificationDeliveryStatus = 'created' | 'delivered' | 'read';
export type NotificationUrgency = 'silent' | 'normal' | 'important';

export type NotificationTopic =
  | 'taobao.security_challenge'
  | 'orders.auto_shipment_completed'
  | 'orders.auto_shipment_failed'
  | 'orders.shipment_failed'
  | 'orders.purchase_lookup_failed'
  | 'orders.refund_failed'
  | 'productAudit.audit_failed'
  | 'productAudit.audit_warning'
  | 'scheduled_job.failed'
  | 'system.credential_invalid';

export interface ActivityLogNotificationIntent {
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
  level: ActivityLogLevel;
  domain: ActivityLogDomain;
  event: ActivityLogEvent;
  title: string;
  detail?: string;
  errorMessage?: string;
  accountId?: string;
  accountName?: string;
  trigger?: ActivityLogEntry['trigger'];
  runId?: string;
  readAt?: number;
  metadata?: ActivityLogEntry['metadata'];
}

export interface NotificationPreference {
  inAppEnabled: boolean;
  topicEnabled: Record<NotificationTopic, boolean>;
  domainEnabled: Record<ActivityLogDomain, boolean>;
}

export const DEFAULT_NOTIFICATION_PREFERENCE: NotificationPreference = {
  inAppEnabled: true,
  topicEnabled: {
    'taobao.security_challenge': true,
    'orders.auto_shipment_completed': true,
    'orders.auto_shipment_failed': true,
    'orders.shipment_failed': true,
    'orders.purchase_lookup_failed': true,
    'orders.refund_failed': true,
    'productAudit.audit_failed': true,
    'productAudit.audit_warning': true,
    'scheduled_job.failed': true,
    'system.credential_invalid': true,
  },
  domainEnabled: {
    listing: true,
    productAudit: true,
    violation: true,
    orders: true,
    store: true,
    scheduler: true,
    system: true,
  },
};

export interface NotificationTopicDefinition {
  topic: NotificationTopic;
  domain: ActivityLogDomain;
  label: string;
  description: string;
  defaultUrgency: NotificationUrgency;
}

export const NOTIFICATION_TOPIC_DEFINITIONS: NotificationTopicDefinition[] = [
  {
    topic: 'taobao.security_challenge',
    domain: 'orders',
    label: '淘宝/天猫需要处理',
    description: '工作页遇到登录、安全验证、访问受限等需要人工处理的情况。',
    defaultUrgency: 'important',
  },
  {
    topic: 'orders.auto_shipment_completed',
    domain: 'orders',
    label: '自动发货成功',
    description: '检测到采购单已发货后，自动向微信小店提交发货成功。',
    defaultUrgency: 'normal',
  },
  {
    topic: 'orders.auto_shipment_failed',
    domain: 'orders',
    label: '自动发货失败',
    description: '检测到采购单已发货后，自动向微信小店提交发货失败。',
    defaultUrgency: 'important',
  },
  {
    topic: 'orders.shipment_failed',
    domain: 'orders',
    label: '订单发货失败',
    description: '微信小店发货回填失败、快递公司匹配失败或接口提交失败。',
    defaultUrgency: 'important',
  },
  {
    topic: 'orders.purchase_lookup_failed',
    domain: 'orders',
    label: '淘宝订单读取失败',
    description: '读取淘宝订单状态、物流或采购信息失败。',
    defaultUrgency: 'important',
  },
  {
    topic: 'orders.refund_failed',
    domain: 'orders',
    label: '退款申请失败',
    description: '淘宝退款申请页准备或自动提交失败。',
    defaultUrgency: 'important',
  },
  {
    topic: 'productAudit.audit_failed',
    domain: 'productAudit',
    label: '商品提审失败',
    description: '手动或定时商品提审任务失败。',
    defaultUrgency: 'important',
  },
  {
    topic: 'productAudit.audit_warning',
    domain: 'productAudit',
    label: '商品提审异常摘要',
    description: '商品提审完成但存在跳过、错误、停止或配额异常。',
    defaultUrgency: 'normal',
  },
  {
    topic: 'scheduled_job.failed',
    domain: 'scheduler',
    label: '定时任务失败',
    description: '调度中心执行定时任务失败。',
    defaultUrgency: 'important',
  },
  {
    topic: 'system.credential_invalid',
    domain: 'system',
    label: '店铺凭证失效',
    description: '店铺授权、AppSecret 或接口凭证不可用。',
    defaultUrgency: 'important',
  },
];

export function normalizeNotificationPreference(value: unknown): NotificationPreference {
  const input = value as Partial<NotificationPreference> | undefined;
  const topicEnabled = Object.fromEntries(
    NOTIFICATION_TOPIC_DEFINITIONS.map(definition => [
      definition.topic,
      input?.topicEnabled?.[definition.topic] ?? DEFAULT_NOTIFICATION_PREFERENCE.topicEnabled[definition.topic],
    ]),
  ) as Record<NotificationTopic, boolean>;

  const domains = Object.keys(DEFAULT_NOTIFICATION_PREFERENCE.domainEnabled) as ActivityLogDomain[];
  const domainEnabled = Object.fromEntries(
    domains.map(domain => [
      domain,
      input?.domainEnabled?.[domain] ?? DEFAULT_NOTIFICATION_PREFERENCE.domainEnabled[domain],
    ]),
  ) as Record<ActivityLogDomain, boolean>;

  return {
    inAppEnabled: input?.inAppEnabled ?? DEFAULT_NOTIFICATION_PREFERENCE.inAppEnabled,
    topicEnabled,
    domainEnabled,
  };
}
