import React, { useMemo } from 'react';
import { Button, Empty, Space, Table, Tag, Tooltip } from 'antd';
import type { TableProps } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { extensionApi } from '../../shared/extension-api';
import type { Account, ScheduledJob, ScheduledJobStatus } from '../../shared/types';
import { queryKeys } from '../../query/query-keys';

interface ScheduledJobsPageProps {
  accounts: Account[];
}

const moduleLabels: Record<ScheduledJob['module'], string> = {
  listing: '商品提审',
  orders: '订单管理',
  violation: '违规检测',
  store: '店铺管理',
  system: '系统',
};

const jobTypeLabels: Record<ScheduledJob['jobType'], string> = {
  'listing.submitDrafts': '提交待审核商品',
  'orders.checkShipmentStatus': '检测发货状态',
  'violation.scanProducts': '扫描违规商品',
};

const statusColors: Record<ScheduledJobStatus, string> = {
  idle: 'default',
  running: 'processing',
  waiting_user: 'warning',
  completed: 'success',
  failed: 'error',
  skipped: 'default',
};

const statusLabels: Record<ScheduledJobStatus, string> = {
  idle: '空闲',
  running: '运行中',
  waiting_user: '待处理',
  completed: '完成',
  failed: '失败',
  skipped: '跳过',
};

function formatTime(timestamp?: number): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCron(cronExpression: string): string {
  const daily = cronExpression.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
  if (daily) return `每天 ${daily[2].padStart(2, '0')}:${daily[1].padStart(2, '0')}`;

  const everyMinutes = cronExpression.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (everyMinutes) return `每 ${everyMinutes[1]} 分钟`;

  const hourly = cronExpression.match(/^(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (hourly) return `每小时第 ${hourly[1].padStart(2, '0')} 分钟`;

  return cronExpression;
}

const ScheduledJobsPage: React.FC<ScheduledJobsPageProps> = ({ accounts }) => {
  const accountNameById = useMemo(
    () => new Map(accounts.map(account => [account.id, account.name])),
    [accounts],
  );

  const { data = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: queryKeys.scheduledJobs.list,
    queryFn: () => extensionApi.scheduledJobs.list(),
  });

  const rows = useMemo(
    () => [...data].sort((a, b) => b.updatedAt - a.updatedAt),
    [data],
  );

  const enabledCount = rows.filter(job => job.enabled).length;
  const globalCount = rows.filter(job => job.scope === 'global').length;
  const runningCount = rows.filter(job => job.stats.lastStatus === 'running').length;

  const columns: TableProps<ScheduledJob>['columns'] = [
    {
      title: '任务',
      dataIndex: 'name',
      key: 'name',
      width: 240,
      render: (_, job) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.name}</div>
          <div style={{ marginTop: 4 }}>
            <Space size={4} wrap>
              <Tag color="blue">{moduleLabels[job.module]}</Tag>
              <Tag>{jobTypeLabels[job.jobType]}</Tag>
            </Space>
          </div>
        </div>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 130,
      render: (_, job) => {
        const status = job.stats.lastStatus || 'idle';
        return (
          <Space size={4} vertical>
            <Tag color={job.enabled ? 'green' : 'default'}>{job.enabled ? '已启用' : '已停用'}</Tag>
            <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>
          </Space>
        );
      },
    },
    {
      title: '作用域',
      key: 'scope',
      width: 180,
      render: (_, job) => {
        if (job.scope === 'global') {
          const excluded = job.excludedAccountIds?.length || 0;
          const activeAccounts = Math.max(accounts.length - excluded, 0);
          return (
            <Space size={4} vertical>
              <Tag color="purple">全账号</Tag>
              <span style={{ color: '#666', fontSize: 12 }}>{activeAccounts}/{accounts.length} 个账号参与</span>
            </Space>
          );
        }
        return (
          <Space size={4} vertical>
            <Tag>单账号</Tag>
            <Tooltip title={job.accountId}>
              <span style={{ color: '#666', fontSize: 12 }}>{accountNameById.get(job.accountId || '') || job.accountId || '-'}</span>
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: '计划',
      key: 'schedule',
      width: 170,
      render: (_, job) => (
        <Space size={4} vertical>
          <span>{formatCron(job.cronExpression)}</span>
          {job.scope === 'global' && <span style={{ color: '#999', fontSize: 12 }}>错峰 {job.staggerMinutes || 0} 分钟/账号</span>}
        </Space>
      ),
    },
    {
      title: '今日',
      key: 'today',
      width: 120,
      render: (_, job) => (
        <span>
          {job.stats.todayRunCount}
          {(job.dailyLimit || 0) > 0 ? `/${job.dailyLimit}` : ''}
        </span>
      ),
    },
    {
      title: '最近运行',
      key: 'lastRun',
      width: 180,
      render: (_, job) => (
        <Space size={4} vertical>
          <span>{formatTime(job.stats.lastRunAt)}</span>
          {job.stats.lastError && (
            <Tooltip title={job.stats.lastError}>
              <span style={{ maxWidth: 150, color: '#cf1322', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {job.stats.lastError}
              </span>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '更新',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 140,
      render: (updatedAt: number) => formatTime(updatedAt),
    },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid #f0f0f0' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>调度任务</div>
          <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
            共 {rows.length} 个任务，{enabledCount} 个启用，{globalCount} 个全账号任务，{runningCount} 个运行中
          </div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching}>
          刷新
        </Button>
      </div>

      <div style={{ flex: 1, minHeight: 0, paddingTop: 12 }}>
        <Table<ScheduledJob>
          rowKey="id"
          size="small"
          loading={isLoading}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          scroll={{ x: 1160, y: 'calc(100vh - 190px)' }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无调度任务" /> }}
        />
      </div>
    </div>
  );
};

export default ScheduledJobsPage;
