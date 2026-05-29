import type { ScheduledJob } from '../../shared/types';
import { ExternalRequestError, externalErrorMetadata, formatExternalErrorDetail } from '../errors/external-error.ts';

export interface ScheduledJobFailureLogInput {
  job: Pick<ScheduledJob, 'name' | 'jobType' | 'scope'>;
  accountId?: string;
  accountName?: string;
  error: unknown;
}

export interface ScheduledJobFailureLogParts {
  detail: string;
  errorMessage: string;
  notificationDetail: string;
  metadata: Record<string, string | number | boolean | null>;
}

function triggerLabel(job: Pick<ScheduledJob, 'scope'>): string {
  if (job.scope === 'global') return '全部账号定时';
  if (job.scope === 'system') return '后台';
  return '单账号定时';
}

function accountLabel(input: Pick<ScheduledJobFailureLogInput, 'job' | 'accountId' | 'accountName'>): string {
  if (input.accountName) return input.accountName;
  if (input.accountId) return input.accountId;
  return input.job.scope === 'global' ? '全部账号' : '单账号';
}

function unknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '未知错误');
}

export function formatScheduledJobFailureLog(input: ScheduledJobFailureLogInput): ScheduledJobFailureLogParts {
  const account = accountLabel(input);
  const baseParts = [
    `任务：${input.job.name}`,
    `任务类型：${input.job.jobType}`,
    `触发：${triggerLabel(input.job)}`,
    `账号：${account}`,
  ];

  if (input.error instanceof ExternalRequestError) {
    const detail = [...baseParts, formatExternalErrorDetail(input.error)].join('；');
    const notificationParts = [
      input.job.name,
      account,
      input.error.stage,
      input.error.message,
    ].filter(Boolean);

    return {
      detail,
      errorMessage: input.error.message,
      notificationDetail: notificationParts.join(' / '),
      metadata: {
        jobType: input.job.jobType,
        ...externalErrorMetadata(input.error),
      },
    };
  }

  const message = unknownErrorMessage(input.error);
  return {
    detail: [...baseParts, `错误：${message}`].join('；'),
    errorMessage: message,
    notificationDetail: [input.job.name, account, message].filter(Boolean).join(' / '),
    metadata: {
      jobType: input.job.jobType,
      errorKind: 'unknown',
    },
  };
}
