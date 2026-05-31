import React, { useMemo, useState } from 'react';
import { Button, Drawer, Empty, FloatButton, List, Space, Switch, Tag, Typography } from 'antd';
import { BellOutlined, CheckOutlined, ClearOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { useNotifications } from '../hooks/useIpc';
import type { ActivityLogDomain, ActivityLogEvent, ActivityLogLevel, ActivityLogTrigger } from '../shared/activity-log';
import type { NotificationEntry, NotificationPreference, NotificationTopic } from '../shared/notification';
import { NOTIFICATION_TOPIC_DEFINITIONS } from '../shared/notification';

const { Text } = Typography;

const domainLabels: Record<ActivityLogDomain, string> = {
  listing: '商品提审',
  violation: '违规词',
  orders: '订单',
  store: '店铺',
  scheduler: '定时任务',
  system: '系统',
};

const levelLabels: Record<ActivityLogLevel, string> = {
  error: '失败',
  warning: '警告',
  success: '成功',
  info: '信息',
};

const levelColors: Record<ActivityLogLevel, string> = {
  error: 'red',
  warning: 'orange',
  success: 'green',
  info: 'blue',
};

const eventLabels: Record<ActivityLogEvent, string> = {
  started: '开始',
  queued: '排队',
  waiting_user: '需处理',
  completed: '完成',
  skipped: '跳过',
  failed: '失败',
};

const triggerLabels: Record<ActivityLogTrigger, string> = {
  manual: '手动',
  scheduled: '单账号定时',
  globalScheduled: '全部账号定时',
  background: '后台',
};

const notificationDomains: ActivityLogDomain[] = ['listing', 'orders', 'violation', 'store', 'scheduler', 'system'];
const notificationTopicsByDomain = NOTIFICATION_TOPIC_DEFINITIONS.reduce((acc, definition) => {
  const current = acc[definition.domain] || [];
  return { ...acc, [definition.domain]: [...current, definition.topic] };
}, {} as Partial<Record<ActivityLogDomain, NotificationTopic[]>>);
const notificationTopicById = Object.fromEntries(
  NOTIFICATION_TOPIC_DEFINITIONS.map(definition => [definition.topic, definition]),
) as Record<NotificationTopic, typeof NOTIFICATION_TOPIC_DEFINITIONS[number]>;

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function unreadSeverity(notifications: NotificationEntry[]): ActivityLogLevel | null {
  const unread = notifications.filter(notification => !notification.readAt);
  if (unread.some(notification => notification.level === 'error')) return 'error';
  if (unread.some(notification => notification.level === 'warning')) return 'warning';
  if (unread.some(notification => notification.level === 'success')) return 'success';
  return unread.length > 0 ? 'info' : null;
}

function PreferenceRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <Text>{label}</Text>
        {description && (
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>{description}</Text>
          </div>
        )}
      </div>
      <Switch size="small" checked={checked} onChange={onChange} />
    </div>
  );
}

function NotificationPreferencePanel({
  preference,
  onChange,
}: {
  preference: NotificationPreference;
  onChange: (patch: Partial<NotificationPreference>) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: 10, padding: '8px 0 16px' }}>
      <PreferenceRow
        label="页面内通知"
        checked={preference.inAppEnabled}
        onChange={checked => onChange({ inAppEnabled: checked })}
      />
      <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 10, display: 'grid', gap: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>按业务域接收</Text>
        {notificationDomains.map(domain => (
          <PreferenceRow
            key={domain}
            label={domainLabels[domain]}
            checked={preference.domainEnabled[domain] !== false}
            onChange={checked => onChange({
              domainEnabled: { ...preference.domainEnabled, [domain]: checked },
            })}
          />
        ))}
      </div>
      <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 10, display: 'grid', gap: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>按业务场景接收</Text>
        {notificationDomains.map(domain => {
          const topics = notificationTopicsByDomain[domain] || [];
          if (topics.length === 0) return null;
          return (
            <div key={domain} style={{ display: 'grid', gap: 8 }}>
              <Text strong style={{ fontSize: 13 }}>{domainLabels[domain]}</Text>
              {topics.map(topic => {
                const definition = notificationTopicById[topic];
                return (
                  <PreferenceRow
                    key={topic}
                    label={definition.label}
                    description={definition.description}
                    checked={preference.topicEnabled[topic] !== false}
                    onChange={checked => onChange({
                      topicEnabled: { ...preference.topicEnabled, [topic]: checked },
                    })}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NotificationItem({
  notification,
  onRead,
}: {
  notification: NotificationEntry;
  onRead: (notificationId: string) => void;
}) {
  return (
    <List.Item
      actions={!notification.readAt ? [
        <Button key="read" type="link" size="small" onClick={() => onRead(notification.id)}>
          已读
        </Button>,
      ] : undefined}
    >
      <List.Item.Meta
        title={(
          <Space size={6} wrap>
            <Tag color={levelColors[notification.level]} variant="filled">{levelLabels[notification.level]}</Tag>
            <Tag color={levelColors[notification.level]} variant="outlined">{eventLabels[notification.event]}</Tag>
            <Tag>{domainLabels[notification.domain]}</Tag>
            <Tag>{notificationTopicById[notification.topic]?.label || notification.topic}</Tag>
            {notification.trigger && <Tag>{triggerLabels[notification.trigger]}</Tag>}
            {!notification.readAt && <Tag color="red">未读</Tag>}
          </Space>
        )}
        description={(
          <div style={{ display: 'grid', gap: 4 }}>
            <Text strong>{notification.title}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{formatTime(notification.timestamp)}</Text>
            {notification.detail && <Text style={{ fontSize: 12 }}>{notification.detail}</Text>}
            {notification.errorMessage && <Text type="danger" style={{ fontSize: 12 }}>{notification.errorMessage}</Text>}
          </div>
        )}
      />
    </List.Item>
  );
}

const NotificationCenter: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const {
    notifications,
    preference,
    loading,
    fetchNotifications,
    markRead,
    markAllRead,
    clearNotifications,
    updatePreference,
  } = useNotifications();

  const sortedNotifications = useMemo(() => [...notifications].sort((a, b) => b.timestamp - a.timestamp), [notifications]);
  const unreadCount = notifications.filter(notification => !notification.readAt).length;
  const severity = unreadSeverity(notifications);
  const badge = unreadCount > 0
    ? {
      count: unreadCount,
      overflowCount: 99,
      color: severity === 'error' ? '#cf1322' : severity === 'warning' ? '#fa8c16' : undefined,
    }
    : undefined;

  const handleOpen = () => {
    setOpen(true);
    if (unreadCount > 0) {
      markAllRead().catch(() => {});
    }
  };

  return (
    <>
      <FloatButton
        icon={<BellOutlined />}
        content="通知"
        tooltip="查看通知中心"
        type={severity === 'error' || severity === 'warning' ? 'primary' : 'default'}
        shape="square"
        badge={badge}
        style={{ right: 24, bottom: 96 }}
        onClick={handleOpen}
      />
      <Drawer
        title="通知中心"
        placement="right"
        size="min(480px, calc(100vw - 32px))"
        open={open}
        onClose={() => setOpen(false)}
        loading={loading}
        zIndex={1110}
        styles={{ body: { padding: 16 } }}
        extra={(
          <Space size={8}>
            <Button size="small" icon={<SettingOutlined />} onClick={() => setSettingsOpen(prev => !prev)}>
              设置
            </Button>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => fetchNotifications().catch(() => {})}>
              刷新
            </Button>
            <Button size="small" icon={<CheckOutlined />} onClick={() => markAllRead().catch(() => {})}>
              全部已读
            </Button>
            <Button size="small" danger icon={<ClearOutlined />} onClick={() => clearNotifications().catch(() => {})}>
              清空
            </Button>
          </Space>
        )}
      >
        {settingsOpen && (
          <NotificationPreferencePanel
            preference={preference}
            onChange={patch => updatePreference(patch).catch(() => {})}
          />
        )}
        {sortedNotifications.length === 0 ? (
          <Empty description="暂无通知" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            itemLayout="vertical"
            dataSource={sortedNotifications}
            rowKey="id"
            renderItem={notification => (
              <NotificationItem
                notification={notification}
                onRead={notificationId => markRead(notificationId).catch(() => {})}
              />
            )}
          />
        )}
      </Drawer>
    </>
  );
};

export default NotificationCenter;
