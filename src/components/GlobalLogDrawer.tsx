import React, { useMemo, useState } from 'react';
import { Button, Drawer, Empty, FloatButton, Space, Tag, Timeline, Typography } from 'antd';
import { ClearOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
import { useGlobalLogs } from '../hooks/useIpc';
import type { GlobalLogEntry, GlobalLogEventType, GlobalLogLevel, GlobalLogModule, GlobalLogTaskKind } from '../shared/global-log';

const { Text } = Typography;

const moduleLabels: Record<GlobalLogModule, string> = {
  listing: '商品提审',
  violation: '违规词',
  orders: '订单',
  store: '店铺',
  scheduler: '定时任务',
  system: '系统',
};

const levelColors: Record<GlobalLogLevel, string> = {
  info: 'blue',
  success: 'green',
  warning: 'orange',
  error: 'red',
};

const timelineColors: Record<GlobalLogLevel, string> = {
  info: 'blue',
  success: 'green',
  warning: 'orange',
  error: 'red',
};

const eventLabels: Record<GlobalLogEventType, string> = {
  started: '开始',
  queued: '排队',
  waiting_user: '需处理',
  completed: '完成',
  skipped: '跳过',
  failed: '失败',
};

const taskKindLabels: Record<GlobalLogTaskKind, string> = {
  manual: '手动',
  scheduled: '单账号定时',
  globalScheduled: '全部账号定时',
  background: '后台',
};

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

function LogContent({ log }: { log: GlobalLogEntry }) {
  const scopeLabel = log.scope === 'global' ? '全部账号' : (log.accountName || log.accountId || '单账号');

  return (
    <div style={{ paddingBottom: 10 }}>
      <Space size={6} wrap style={{ marginBottom: 6 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>{formatTime(log.timestamp)}</Text>
        <Tag color={levelColors[log.level]} variant="filled">{moduleLabels[log.module]}</Tag>
        <Tag color={levelColors[log.level]} variant="outlined">{eventLabels[log.eventType]}</Tag>
        {log.taskKind && <Tag>{taskKindLabels[log.taskKind]}</Tag>}
        <Tag variant="filled">{scopeLabel}</Tag>
      </Space>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#1f1f1f', lineHeight: 1.5 }}>
        {log.title}
      </div>
      {log.detail && (
        <div style={{ marginTop: 4, color: '#666', fontSize: 12, lineHeight: 1.6, wordBreak: 'break-word' }}>
          {log.detail}
        </div>
      )}
      {log.error && (
        <div style={{ marginTop: 4, color: '#cf1322', fontSize: 12, lineHeight: 1.6, wordBreak: 'break-word' }}>
          {log.error.code ? `错误码 ${log.error.code}：` : ''}{log.error.message}
        </div>
      )}
      {log.taskName && (
        <div style={{ marginTop: 4 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>任务：{log.taskName}</Text>
        </div>
      )}
    </div>
  );
}

const GlobalLogDrawer: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [lastViewedAt, setLastViewedAt] = useState(Date.now());
  const { logs, loading, fetchLogs, clearLogs } = useGlobalLogs();

  const unreadCount = open ? 0 : logs.filter(log => log.timestamp > lastViewedAt).length;
  const timelineItems = useMemo(() => [...logs]
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(log => ({
      key: log.id,
      color: timelineColors[log.level],
      children: <LogContent log={log} />,
    })), [logs]);

  const handleOpen = () => {
    setOpen(true);
    setLastViewedAt(Date.now());
  };

  return (
    <>
      <FloatButton
        icon={<FileTextOutlined />}
        content="日志"
        tooltip="查看日志中心"
        type="primary"
        shape="square"
        badge={unreadCount > 0 ? { count: unreadCount, overflowCount: 99 } : undefined}
        onClick={handleOpen}
      />
      <Drawer
        title="日志中心"
        placement="right"
        size="min(480px, calc(100vw - 32px))"
        open={open}
        onClose={() => setOpen(false)}
        loading={loading}
        zIndex={1100}
        styles={{ body: { padding: 16 } }}
        extra={(
          <Space size={8}>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => fetchLogs().catch(() => {})}>
              刷新
            </Button>
            <Button size="small" danger icon={<ClearOutlined />} onClick={() => clearLogs().catch(() => {})}>
              清空
            </Button>
          </Space>
        )}
      >
        {timelineItems.length === 0 ? (
          <Empty description="暂无日志" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Timeline items={timelineItems} />
        )}
      </Drawer>
    </>
  );
};

export default GlobalLogDrawer;
