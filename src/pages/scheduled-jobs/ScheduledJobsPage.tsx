import React, { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Popconfirm, Space, Table, Tag, Tooltip, message } from 'antd';
import type { TableProps } from 'antd';
import { PlayCircleOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extensionApi } from '../../shared/extension-api';
import type { Account, ScheduledJob, ScheduledJobRunStats, ScheduledJobStatus, ScheduledJobView } from '../../shared/types';
import { queryKeys } from '../../query/query-keys';
import { formatCron, nextRunCountdownText } from './scheduled-job-display';

interface ScheduledJobsPageProps {
  accounts: Account[];
}

const moduleLabels: Record<ScheduledJob['module'], string> = {
  productCopy: '商品复制',
  productAudit: '商品提审',
  orders: '订单管理',
  violation: '违规检测',
  store: '店铺管理',
  system: '系统',
};

const jobTypeLabels: Record<ScheduledJob['jobType'], string> = {
  'productAudit.submitDrafts': '提交待审核草稿',
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
  cancelled: 'warning',
};

const statusLabels: Record<ScheduledJobStatus, string> = {
  idle: '空闲',
  running: '运行中',
  waiting_user: '待处理',
  completed: '完成',
  failed: '失败',
  skipped: '跳过',
  cancelled: '已停止',
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
    case 'cancelled':
    case 'skipped':
      return 2;
    case 'idle':
    default:
      return 1;
  }
}

function effectiveStats(job: ScheduledJobView): ScheduledJobRunStats {
  const currentDate = todayKey();
  if (job.scope !== 'global') {
    return {
      ...job.stats,
      todayRunCount: job.stats.lastRunDate === currentDate ? job.stats.todayRunCount : 0,
    };
  }

  const accountStats = Object.values(job.accountStats);
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

function activeRunsFor(job: ScheduledJobView) {
  // activeRuns 来自 background 当前内存，表示真实正在跑的实例；
  // 旧页面或旧后台返回空值时按空数组处理，避免调度页崩溃。
  return job.activeRuns || [];
}

function activeRunDurationText(startedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分 ${seconds % 60} 秒`;
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
}

function activeRunsDetail(job: ScheduledJobView, accountNameById: Map<string, string>, now: number): string {
  // 全账号任务可能同时存在多个账号实例，tooltip 展示账号和运行时长，
  // 让用户能判断停止按钮会影响哪些后台执行。
  const runs = activeRunsFor(job);
  if (runs.length === 0) return '';
  return runs.map(run => {
    const accountName = run.accountId ? accountNameById.get(run.accountId) || run.accountId : '系统任务';
    const stopText = run.requestedStopAt ? '，正在停止' : '';
    return `${accountName}：已运行 ${activeRunDurationText(run.startedAt, now)}${stopText}`;
  }).join('；');
}

function lifecycleLabel(job: ScheduledJobView): { text: string; color: string } {
  if (job.enabled) return { text: '已启用', color: 'green' };
  if (job.completedAt != null) return { text: '已完成', color: 'success' };
  return { text: '已停用', color: 'default' };
}

const ScheduledJobsPage: React.FC<ScheduledJobsPageProps> = ({ accounts }) => {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [runningJobId, setRunningJobId] = useState('');
  const [stoppingJobId, setStoppingJobId] = useState('');
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
    refetchInterval: 3000,
  });

  const runNowMutation = useMutation({
    mutationFn: (jobId: string) => extensionApi.scheduledJobs.runNow(jobId),
    onMutate: (jobId) => {
      setRunningJobId(jobId);
    },
    onSuccess: (result) => {
      if (result.status === 'failed') {
        message.error(result.error || '任务执行失败');
      } else if (result.status === 'cancelled') {
        message.warning(result.message || '任务已停止');
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

  const stopRunMutation = useMutation({
    mutationFn: (jobId: string) => extensionApi.scheduledJobs.stopRun(jobId),
    onMutate: (jobId) => {
      setStoppingJobId(jobId);
    },
    onSuccess: (result) => {
      if (result.stoppedRunCount > 0) {
        message.success(result.message);
      } else {
        message.warning(result.message);
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs.list });
      void refetch();
    },
    onError: (err: any) => {
      message.error(`停止任务失败: ${err?.message || String(err)}`);
    },
    onSettled: () => {
      setStoppingJobId('');
    },
  });

  const rows = useMemo(
    () => [...data].sort((a, b) => {
      const activeDiff = Number(activeRunsFor(b).length > 0) - Number(activeRunsFor(a).length > 0);
      if (activeDiff !== 0) return activeDiff;
      return b.updatedAt - a.updatedAt;
    }),
    [data],
  );

  const enabledCount = rows.filter(job => job.enabled).length;
  const globalCount = rows.filter(job => job.scope === 'global').length;
  const runningCount = rows.filter(job => activeRunsFor(job).length > 0).length;

  const columns: TableProps<ScheduledJobView>['columns'] = [
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
        const activeRuns = activeRunsFor(job);
        const status = activeRuns.length > 0 ? 'running' : job.completedAt != null ? 'completed' : effectiveStats(job).lastStatus || 'idle';
        const lifecycle = lifecycleLabel(job);
        return (
          <Space size={4} vertical>
            <Tag color={lifecycle.color}>{lifecycle.text}</Tag>
            <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>
            {activeRuns.length > 0 && (
              <Tooltip title={activeRunsDetail(job, accountNameById, now)}>
                <Tag color={activeRuns.some(run => run.requestedStopAt) ? 'warning' : 'processing'}>
                  {activeRuns.some(run => run.requestedStopAt) ? '正在停止' : `运行实例 ${activeRuns.length}`}
                </Tag>
              </Tooltip>
            )}
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
        if (job.scope === 'system') {
          return (
            <Space size={4} vertical>
              <Tag color="geekblue">系统</Tag>
              <span style={{ color: '#666', fontSize: 12 }}>后台任务</span>
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
          <Tag color={job.runMode === 'untilComplete' ? 'gold' : 'default'}>
            {job.runMode === 'untilComplete' ? '执行至完成' : '周期任务'}
          </Tag>
          {job.completedAt != null && <span style={{ color: '#999', fontSize: 12 }}>完成于 {formatTime(job.completedAt)}</span>}
          {job.scope === 'global' && <span style={{ color: '#999', fontSize: 12 }}>错峰 {job.staggerMinutes} 分钟/账号</span>}
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
          {job.dailyLimit > 0 ? `/${job.dailyLimit}` : ''}
        </span>
      ),
    },
    {
      title: '最近运行',
      key: 'lastRun',
      width: 180,
      render: (_, job) => {
        const stats = effectiveStats(job);
        const activeRuns = activeRunsFor(job);
        const detail = stats.lastError || stats.lastMessage;
        return (
          <Space size={4} vertical>
            <span>{formatTime(stats.lastRunAt)}</span>
            {activeRuns.length > 0 && (
              <Tooltip title={activeRunsDetail(job, accountNameById, now)}>
                <span style={{ maxWidth: 160, color: '#1677ff', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeRuns.length} 个实例运行中
                </span>
              </Tooltip>
            )}
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
      width: 190,
      fixed: 'right',
      render: (_, job) => {
        const activeRuns = activeRunsFor(job);
        return (
          <Space size={6} wrap>
            <Tooltip title={activeRuns.length > 0 ? '任务运行中，先停止本次执行后再手动执行' : undefined}>
              <Button
                size="small"
                icon={<PlayCircleOutlined />}
                disabled={!job.enabled || activeRuns.length > 0}
                loading={runNowMutation.isPending && runningJobId === job.id}
                onClick={() => runNowMutation.mutate(job.id)}
              >
                立即执行
              </Button>
            </Tooltip>
            {activeRuns.length > 0 && (
              <Popconfirm
                title="停止本次执行"
                description="只停止当前正在运行的实例，不会删除任务或关闭后续定时计划。"
                okText="停止"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => stopRunMutation.mutate(job.id)}
              >
                <Button
                  danger
                  size="small"
                  icon={<StopOutlined />}
                  loading={stopRunMutation.isPending && stoppingJobId === job.id}
                >
                  停止本次
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
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
        <Table<ScheduledJobView>
          rowKey="id"
          size="small"
          loading={isLoading}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          scroll={{ x: 1360, y: 'calc(100vh - 190px)' }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无调度任务" /> }}
        />
      </div>
    </div>
  );
};

export default ScheduledJobsPage;
