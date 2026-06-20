import type { ScheduledJob } from '../../shared/types';
import { probeTaobaoLoginNow } from '../taobao-login/taobao-login-service';
import { addScheduledJob, getScheduledJob, getScheduledJobs, updateScheduledJob } from '../store/scheduled-job-repository';
import { registerScheduledJobExecutor } from './scheduler-center';

/**
 * 淘宝登录态定时心跳。
 *
 * 定时导航 background-task 工作页到探测页（buyertrade），由 content script 回报登录态，
 * 让后台的全局登录态快照保持新鲜，前端 Header 指示器能反映真实状态（即使空闲时）。
 *
 * 探测本身复用 taobao-login-service 的 probeTaobaoLoginNow：
 *   - 命中已登录 → 静默更新快照（不广播、不通知，避免噪音）。
 *   - 命中未登录 → 由 service 写"未登录"活动日志 + 通知（带 throttle）。
 */

const DEFAULT_HEARTBEAT_JOB_NAME = '淘宝登录态心跳检测';
// 默认每 10 分钟探测一次。心跳只导航一次工作页、由 content 回报，开销很低。
const DEFAULT_HEARTBEAT_CRON = '*/10 * * * *';

export async function ensureTaobaoLoginHeartbeatScheduledJob(): Promise<ScheduledJob | null> {
  const jobs = await getScheduledJobs();
  const existing = jobs.find(job => job.jobType === 'taobaoLogin.checkHeartbeat' && job.scope === 'system');
  if (existing) {
    const patch: Partial<ScheduledJob> = {};
    if (existing.cronExpression !== DEFAULT_HEARTBEAT_CRON) patch.cronExpression = DEFAULT_HEARTBEAT_CRON;
    if (!existing.enabled) patch.enabled = true;
    if (Object.keys(patch).length > 0) {
      await updateScheduledJob(existing.id, patch);
      return (await getScheduledJob(existing.id)) || existing;
    }
    return existing;
  }

  return addScheduledJob({
    name: DEFAULT_HEARTBEAT_JOB_NAME,
    enabled: true,
    module: 'system',
    jobType: 'taobaoLogin.checkHeartbeat',
    scope: 'system',
    runMode: 'recurring',
    cronExpression: DEFAULT_HEARTBEAT_CRON,
    dailyLimit: 0,
    completedAt: null,
    payload: {},
  });
}

export function registerTaobaoLoginHeartbeatScheduledJobs(): void {
  registerScheduledJobExecutor('taobaoLogin.checkHeartbeat', async ({ signal }) => {
    if (signal.aborted) {
      return { listed: 0, status: 'skipped' as const, message: null, error: '任务已取消', completed: false };
    }
    // 心跳探测：source 标记为 heartbeat，结果处理（广播/通知/throttle）由 service 统一负责。
    const snapshot = await probeTaobaoLoginNow('heartbeat');
    return {
      listed: 0,
      status: 'completed' as const,
      message: snapshot.state === 'logged-out' ? '检测到淘宝未登录' : snapshot.state === 'logged-in' ? '淘宝已登录' : '未能判定登录态',
      error: null,
      completed: true,
    };
  });
}
