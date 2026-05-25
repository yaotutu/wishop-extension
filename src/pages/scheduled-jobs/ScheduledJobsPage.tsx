import React, { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Space, Table, Tag, Tooltip, message } from 'antd';
import type { TableProps } from 'antd';
import { PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extensionApi } from '../../shared/extension-api';
import type { Account, ScheduledJob, ScheduledJobRunStats, ScheduledJobStatus } from '../../shared/types';
import { queryKeys } from '../../query/query-keys';
import { formatCron, nextRunCountdownText } from './scheduled-job-display';

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
  'orders.syncRecent': '同步近期订单',
  'orders.backfillHistory': '补拉历史订单',
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

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function statusPriority(status: ScheduledJobStatus): number {
  switch (status) {
    case 'running':
      return 6;
    case 'waiting_user':
      return 5;
    case 'failed':
      return 4;
    case 'completed':
      return 3;
    case 'skipped':
      return 2;
    case 'idle':
    default:
      return 1;
  }
}

function effectiveStats(job: ScheduledJob): ScheduledJobRunStats {
  const currentDate = todayKey();
  if (job.scope !== 'global') {
    return {
      ...job.stats,
      todayRunCount: job.stats.lastRunDate === currentDate ? job.stats.todayRunCount : 0,
    };
  }

  const accountStats = Object.values(job.accountStats || {});
  if (accountStats.length === 0) return job.stats;

  const latestErrorStat = accountStats
    .filter(stat => stat.lastError)
    .sort((a, b) => (b.lastFinishedAt || b.lastRunAt || 0) - (a.lastFinishedAt || a.lastRunAt || 0))[0];
  const latestMessageStat = accountStats
    .filter(stat => stat.lastMessage)
    .sort((a, b) => (b.lastFinishedAt || b.lastRunAt || 0) - (a.lastFinishedAt || a.lastRunAt || 0))[0];
  const lastStatus = accountStats
    .map(stat => stat.lastStatus || 'idle')
    .sort((a, b) => statusPriority(b) - statusPriority(a))[0];

  return {
    lastRunDate: accountStats.some(stat => stat.lastRunDate === currentDate) ? currentDate : job.stats.lastRunDate,
    todayRunCount: accountStats
      .filter(stat => stat.lastRunDate === currentDate)
      .reduce((sum, stat) => sum + stat.todayRunCount, 0),
    lastRunAt: Math.max(0, ...accountStats.map(stat => stat.lastRunAt || 0)) || undefined,
    lastFinishedAt: Math.max(0, ...accountStats.map(stat => stat.lastFinishedAt || 0)) || undefined,
    lastStatus,
    lastMessage: latestMessageStat?.lastMessage,
    lastListed: latestMessageStat?.lastListed,
    lastError: latestErrorStat?.lastError,
  };
}

const ScheduledJobsPage: React.FC<ScheduledJobsPageProps> = ({ accounts }) => {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [runningJobId, setRunningJobId] = useState('');
  const accountNameById = useMemo(
    () => new Map(accounts.map(account => [account.id, account.name])),
    [accounts],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { data = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: queryKeys.scheduledJobs.list,
    queryFn: () => extensionApi.scheduledJobs.list(),
    refetchInterval: 5000,
  });

  const runNowMutation = useMutation({
    mutationFn: (jobId: string) => extensionApi.scheduledJobs.runNow(jobId),
    onMutate: (jobId) => {
      setRunningJobId(jobId);
    },
    onSuccess: (result) => {
      if (result.status === 'failed') {
        message.error(result.error || '任务执行失败');
      } else if (result.status === 'skipped') {
        message.warning(result.message || result.error || '任务已跳过');
      } else {
        message.success(result.message || `任务执行完成，处理 ${result.listed} 项`);
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.list });
      void refetch();
    },
    onError: (err: any) => {
      message.error(`任务执行失败: ${err?.message || String(err)}`);
    },
    onSettled: () => {
      setRunningJobId('');
    },
  });

  const rows = useMemo(
    () => [...data].sort((a, b) => b.updatedAt - a.updatedAt),
    [data],
  );

  const enabledCount = rows.filter(job => job.enabled).length;
  const globalCount = rows.filter(job => job.scope === 'global').length;
  const runningCount = rows.filter(job => effectiveStats(job).lastStatus === 'running').length;

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
        const status = effectiveStats(job).lastStatus || 'idle';
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
      width: 190,
      render: (_, job) => (
        <Space size={4} vertical>
          <span>{formatCron(job.cronExpression)}</span>
          <Tag color={job.enabled && job.nextRunAt ? 'geekblue' : 'default'}>
            {nextRunCountdownText(job, now)}
          </Tag>
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
          {effectiveStats(job).todayRunCount}
          {(job.dailyLimit || 0) > 0 ? `/${job.dailyLimit}` : ''}
        </span>
      ),
    },
    {
      title: '最近运行',
      key: 'lastRun',
      width: 180,
      render: (_, job) => {
        const stats = effectiveStats(job);
        const detail = stats.lastError || stats.lastMessage;
        return (
          <Space size={4} vertical>
            <span>{formatTime(stats.lastRunAt)}</span>
            {detail && (
              <Tooltip title={detail}>
                <span style={{ maxWidth: 150, color: stats.lastError ? '#cf1322' : '#666', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {detail}
                </span>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: '更新',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 140,
      render: (updatedAt: number) => formatTime(updatedAt),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, job) => (
        <Button
          size="small"
          icon={<PlayCircleOutlined />}
          disabled={!job.enabled}
          loading={runNowMutation.isPending && runningJobId === job.id}
          onClick={() => runNowMutation.mutate(job.id)}
        >
          立即执行
        </Button>
      ),
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
          scroll={{ x: 1280, y: 'calc(100vh - 190px)' }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无调度任务" /> }}
        />
      </div>
    </div>
  );
};

export default ScheduledJobsPage;
