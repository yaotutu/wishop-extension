import assert from 'node:assert/strict';
import test from 'node:test';
import { ExternalRequestError } from '../src/background/errors/external-error.ts';
import { formatScheduledJobFailureLog } from '../src/background/scheduler/scheduled-job-error-detail.ts';
import type { ScheduledJob } from '../src/shared/types.ts';

const job: ScheduledJob = {
  id: 'shipment-job',
  name: '采购发货状态检测',
  enabled: true,
  module: 'orders',
  jobType: 'orders.checkShipmentStatus',
  scope: 'global',
  runMode: 'recurring',
  cronExpression: '*/10 * * * *',
  excludedAccountIds: [],
  staggerMinutes: 0,
  dailyLimit: 0,
  payload: {},
  accountStats: {},
  completedAt: null,
  stats: { lastRunDate: '', todayRunCount: 0 },
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

test('formats detailed activity log and concise notification detail for external scheduled job failures', () => {
  const result = formatScheduledJobFailureLog({
    job,
    accountName: '测试店铺',
    error: new ExternalRequestError({
      kind: 'network',
      message: '网络连接失败',
      service: '微信小店',
      method: 'POST',
      path: '/channels/ec/order/list/get',
      stage: '获取订单列表',
      code: 'ERR_NETWORK',
      transient: true,
    }),
  });

  assert.equal(result.errorMessage, '网络连接失败');
  assert.equal(result.notificationDetail, '采购发货状态检测 / 测试店铺 / 获取订单列表 / 网络连接失败');
  assert.equal(result.detail, '任务：采购发货状态检测；任务类型：orders.checkShipmentStatus；触发：全部账号定时；账号：测试店铺；阶段：获取订单列表；服务：微信小店；接口：POST /channels/ec/order/list/get；错误类型：网络连接失败；错误码：ERR_NETWORK；建议：偶发通常可忽略，连续出现请检查本机网络、代理/VPN、DNS 或微信接口连通性');
  assert.deepEqual(result.metadata, {
    jobType: 'orders.checkShipmentStatus',
    stage: '获取订单列表',
    service: '微信小店',
    method: 'POST',
    endpoint: '/channels/ec/order/list/get',
    errorKind: 'network',
    errorCode: 'ERR_NETWORK',
    transient: true,
  });
});

test('formats unknown scheduled job failures without exposing internal objects', () => {
  const result = formatScheduledJobFailureLog({
    job,
    accountName: '测试店铺',
    error: new Error('Unexpected failure'),
  });

  assert.equal(result.errorMessage, 'Unexpected failure');
  assert.equal(result.notificationDetail, '采购发货状态检测 / 测试店铺 / Unexpected failure');
  assert.equal(result.detail, '任务：采购发货状态检测；任务类型：orders.checkShipmentStatus；触发：全部账号定时；账号：测试店铺；错误：Unexpected failure');
  assert.deepEqual(result.metadata, {
    jobType: 'orders.checkShipmentStatus',
    errorKind: 'unknown',
  });
});
