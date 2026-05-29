import React, { useMemo, useState } from 'react';
import { Button, FloatButton, Modal, Space, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { ClearOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
import { useActivityLogs } from '../hooks/useIpc';
import type { ActivityLogDomain, ActivityLogEntry, ActivityLogEvent, ActivityLogLevel, ActivityLogTrigger } from '../shared/activity-log';

const { Text } = Typography;

const domainLabels: Record<ActivityLogDomain, string> = {
  listing: '商品提审',
  violation: '违规词',
  orders: '订单',
  store: '店铺',
  scheduler: '定时任务',
  system: '系统',
};

const levelColors: Record<ActivityLogLevel, string> = {
  info: 'blue',
  success: 'green',
  warning: 'orange',
  error: 'red',
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

const metadataDisplayOrder = [
  'jobType',
  'stage',
  'service',
  'method',
  'endpoint',
  'errorKind',
  'httpStatus',
  'errorCode',
  'requestId',
  'transient',
] as const;

const metadataLabels: Record<typeof metadataDisplayOrder[number], string> = {
  jobType: '任务类型',
  stage: '阶段',
  service: '服务',
  method: '方法',
  endpoint: '接口',
  errorKind: '错误分类',
  httpStatus: 'HTTP',
  errorCode: '错误码',
  requestId: '请求ID',
  transient: '临时性',
};

const errorKindLabels: Record<string, string> = {
  network: '网络连接',
  timeout: '请求超时',
  http: 'HTTP响应',
  api: '接口业务',
  unknown: '未知',
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

function metadataDisplayItems(metadata: ActivityLogEntry['metadata']) {
  if (!metadata) return [];
  return metadataDisplayOrder
    .map((key) => {
      const value = metadata[key];
      if (value === undefined || value === null || value === '') return null;
      const displayValue = key === 'errorKind'
        ? errorKindLabels[String(value)] || String(value)
        : key === 'transient'
          ? value ? '可能偶发' : '需处理'
          : String(value);
      return { key, label: metadataLabels[key], value: displayValue };
    })
    .filter((item): item is { key: typeof metadataDisplayOrder[number]; label: string; value: string } => item !== null);
}

function scopeLabel(log: ActivityLogEntry): string {
  return log.scope === 'global' ? '全部账号' : (log.accountName || log.accountId || '单账号');
}

function compactMetadata(log: ActivityLogEntry): string {
  return metadataDisplayItems(log.metadata)
    .map(item => `${item.label}:${item.value}`)
    .join(' ');
}

function compactSummary(log: ActivityLogEntry): string {
  return [
    log.title,
    log.error?.message ? `错误:${log.error.message}` : '',
    log.detail,
    compactMetadata(log),
  ].filter(Boolean).join(' | ');
}

function OneLineText({ text, danger = false }: { text: string; danger?: boolean }) {
  return (
    <span
      title={text}
      style={{
        color: danger ? '#cf1322' : undefined,
        display: 'block',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}

function ExpandedLog({ log }: { log: ActivityLogEntry }) {
  const metadataText = compactMetadata(log);

  return (
    <div style={{ fontSize: 12, lineHeight: 1.7, wordBreak: 'break-word' }}>
      <div><Text type="secondary">标题：</Text>{log.title}</div>
      {log.detail && <div><Text type="secondary">详情：</Text>{log.detail}</div>}
      {log.error && <div style={{ color: '#cf1322' }}><Text type="secondary">错误：</Text>{log.error.code ? `错误码 ${log.error.code}：` : ''}{log.error.message}</div>}
      {metadataText && <div><Text type="secondary">排查：</Text>{metadataText}</div>}
      {log.runId && <div><Text type="secondary">RunID：</Text>{log.runId}</div>}
    </div>
  );
}

const ActivityLogDrawer: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [lastViewedAt, setLastViewedAt] = useState(Date.now());
  const { logs, loading, fetchLogs, clearLogs } = useActivityLogs();

  const unreadCount = open ? 0 : logs.filter(log => log.timestamp > lastViewedAt).length;
  const sortedLogs = useMemo(() => [...logs].sort((a, b) => b.timestamp - a.timestamp), [logs]);

  const columns = useMemo<TableProps<ActivityLogEntry>['columns']>(() => [
    {
      title: '时间',
      dataIndex: 'timestamp',
      width: 118,
      render: timestamp => <Text type="secondary" style={{ fontSize: 12 }}>{formatTime(Number(timestamp))}</Text>,
    },
    {
      title: '级别',
      dataIndex: 'level',
      width: 66,
      render: level => <Tag color={levelColors[level as ActivityLogLevel]}>{String(level)}</Tag>,
    },
    {
      title: '模块',
      dataIndex: 'domain',
      width: 78,
      render: domain => domainLabels[domain as ActivityLogDomain],
    },
    {
      title: '事件',
      dataIndex: 'event',
      width: 70,
      render: event => eventLabels[event as ActivityLogEvent],
    },
    {
      title: '触发',
      dataIndex: 'trigger',
      width: 96,
      render: trigger => trigger ? triggerLabels[trigger as ActivityLogTrigger] : '',
    },
    {
      title: '账号',
      width: 128,
      render: (_, log) => <OneLineText text={scopeLabel(log)} />,
    },
    {
      title: '任务',
      dataIndex: 'taskName',
      width: 156,
      render: taskName => <OneLineText text={String(taskName || '')} />,
    },
    {
      title: '摘要',
      render: (_, log) => <OneLineText text={compactSummary(log)} danger={log.level === 'error'} />,
    },
  ], []);

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
      <Modal
        title={(
          <Space size={10}>
            <span>日志中心</span>
            <Text type="secondary" style={{ fontSize: 12 }}>{sortedLogs.length} 条</Text>
          </Space>
        )}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width="min(1280px, calc(100vw - 32px))"
        zIndex={1100}
        style={{ top: 32 }}
        styles={{ body: { padding: 12 } }}
      >
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <Space size={8}>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => fetchLogs().catch(() => {})}>
              刷新
            </Button>
            <Button size="small" danger icon={<ClearOutlined />} onClick={() => clearLogs().catch(() => {})}>
              清空
            </Button>
          </Space>
        </div>
        <Table<ActivityLogEntry>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={sortedLogs}
          pagination={false}
          scroll={{ x: 1080, y: 'calc(100vh - 220px)' }}
          tableLayout="fixed"
          expandable={{
            expandedRowRender: log => <ExpandedLog log={log} />,
            rowExpandable: log => Boolean(log.detail || log.error || log.metadata || log.runId),
          }}
          locale={{ emptyText: '暂无日志' }}
        />
      </Modal>
    </>
  );
};

export default ActivityLogDrawer;
