import type { ScheduledJobActiveRun, ScheduledJobStopRunResult, ScheduledJobType } from '../../shared/types';

type StoredScheduledJobRun = {
  run: ScheduledJobActiveRun;
  controller: AbortController;
};

export type ScheduledJobRunHandle = {
  run: ScheduledJobActiveRun;
  signal: AbortSignal;
  finish: () => void;
};

const activeRuns = new Map<string, StoredScheduledJobRun>();

function runKey(jobId: string, runId: string, accountId?: string): string {
  return `${jobId}:${accountId || '__job__'}:${runId}`;
}

function toPublicRun(stored: StoredScheduledJobRun): ScheduledJobActiveRun {
  return { ...stored.run };
}

export function beginScheduledJobRun(input: {
  jobId: string;
  jobType: ScheduledJobType;
  runId: string;
  accountId?: string;
  startedAt?: number;
}): ScheduledJobRunHandle {
  const controller = new AbortController();
  const run: ScheduledJobActiveRun = {
    jobId: input.jobId,
    jobType: input.jobType,
    runId: input.runId,
    accountId: input.accountId,
    startedAt: input.startedAt || Date.now(),
  };
  const key = runKey(run.jobId, run.runId, run.accountId);
  activeRuns.set(key, { run, controller });

  return {
    run,
    signal: controller.signal,
    finish: () => {
      activeRuns.delete(key);
    },
  };
}

export function listActiveScheduledJobRuns(jobId?: string): ScheduledJobActiveRun[] {
  return [...activeRuns.values()]
    .filter(stored => !jobId || stored.run.jobId === jobId)
    .map(toPublicRun)
    .sort((a, b) => a.startedAt - b.startedAt);
}

export function cancelScheduledJobRuns(jobId: string, requestedStopAt = Date.now()): ScheduledJobStopRunResult {
  const matchedRuns = [...activeRuns.values()].filter(stored => stored.run.jobId === jobId);
  if (matchedRuns.length === 0) {
    return {
      stoppedRunCount: 0,
      message: '当前没有正在运行的实例',
    };
  }

  for (const stored of matchedRuns) {
    // AbortController 是后台运行任务的协作式停止信号。执行器需要把 signal 继续传给
    // 可中断的业务循环，这样用户在调度任务页点击停止后，长任务能尽快退出。
    stored.run.requestedStopAt = requestedStopAt;
    stored.controller.abort();
  }

  return {
    stoppedRunCount: matchedRuns.length,
    message: `已请求停止 ${matchedRuns.length} 个运行实例`,
  };
}

export function resetScheduledJobRunRegistryForTest(): void {
  activeRuns.clear();
}
