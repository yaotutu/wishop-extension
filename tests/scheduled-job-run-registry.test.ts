import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beginScheduledJobRun,
  cancelScheduledJobRuns,
  listActiveScheduledJobRuns,
  resetScheduledJobRunRegistryForTest,
} from '../src/background/scheduler/scheduled-job-run-registry.ts';

test('tracks active scheduled job runs and cancels them by job id', () => {
  resetScheduledJobRunRegistryForTest();

  const run = beginScheduledJobRun({
    jobId: 'job-1',
    jobType: 'productAudit.submitDrafts',
    runId: 'run-1',
    accountId: 'account-1',
    startedAt: 1700000000000,
  });

  assert.deepEqual(listActiveScheduledJobRuns('job-1'), [{
    jobId: 'job-1',
    jobType: 'productAudit.submitDrafts',
    runId: 'run-1',
    accountId: 'account-1',
    startedAt: 1700000000000,
  }]);
  assert.equal(run.signal.aborted, false);

  const result = cancelScheduledJobRuns('job-1', 1700000001000);

  assert.deepEqual(result, {
    stoppedRunCount: 1,
    message: '已请求停止 1 个运行实例',
  });
  assert.equal(run.signal.aborted, true);
  assert.deepEqual(listActiveScheduledJobRuns('job-1'), [{
    jobId: 'job-1',
    jobType: 'productAudit.submitDrafts',
    runId: 'run-1',
    accountId: 'account-1',
    startedAt: 1700000000000,
    requestedStopAt: 1700000001000,
  }]);

  run.finish();

  assert.deepEqual(listActiveScheduledJobRuns('job-1'), []);
});

test('reports when there is no active scheduled job run to stop', () => {
  resetScheduledJobRunRegistryForTest();

  assert.deepEqual(cancelScheduledJobRuns('missing-job', 1700000000000), {
    stoppedRunCount: 0,
    message: '当前没有正在运行的实例',
  });
});

test('returns sorted copies so callers cannot mutate the active run registry', () => {
  resetScheduledJobRunRegistryForTest();

  const later = beginScheduledJobRun({
    jobId: 'job-1',
    jobType: 'orders.syncRecent',
    runId: 'run-later',
    startedAt: 1700000002000,
  });
  const earlier = beginScheduledJobRun({
    jobId: 'job-1',
    jobType: 'orders.syncRecent',
    runId: 'run-earlier',
    startedAt: 1700000001000,
  });

  const listedRuns = listActiveScheduledJobRuns('job-1');
  listedRuns[0].requestedStopAt = 1;

  assert.deepEqual(listedRuns.map(run => run.runId), ['run-earlier', 'run-later']);
  assert.equal(listActiveScheduledJobRuns('job-1')[0].requestedStopAt, undefined);

  later.finish();
  earlier.finish();
});
