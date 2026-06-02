import assert from 'node:assert/strict';
import test from 'node:test';
import 'fake-indexeddb/auto';
import { extensionDb } from '../src/background/db/extension-db.ts';
import { cleanupProductAuditLegacyData } from '../src/background/store/product-audit-legacy-cleanup.ts';

async function resetDb(): Promise<void> {
  await extensionDb.delete();
  await extensionDb.open();
}

test('cleanupProductAuditLegacyData removes old audit config, rules, jobs, and listing logs', async () => {
  await resetDb();

  await extensionDb.accountWorkspaces.put({
    accountId: 'account-1',
    taskConfig: {
      listUnreviewed: true,
      listUnreviewedQuantity: 20,
      autoDeleteFailed: true,
    },
    productAuditConfig: {
      submitUnauditedDrafts: true,
      submitLimit: 10,
      defaultFailureAction: 'keepDraft',
    },
    scheduledJobs: [{
      id: 'old-job',
      name: '旧商品提审',
      enabled: true,
      module: 'listing',
      jobType: 'listing.submitDrafts',
      scope: 'account',
      accountId: 'account-1',
      runMode: 'recurring',
      cronExpression: '0 9 * * *',
      dailyLimit: 0,
      payload: {},
      completedAt: null,
      stats: { lastRunDate: '', todayRunCount: 0 },
      createdAt: 1,
      updatedAt: 1,
    }],
    productSources: [],
    orderAssociations: [],
    realAddressCaches: [],
    rules: {
      skipKeywords: ['保留'],
      blacklistRules: [{ code: 6600144, description: '旧停止规则' }],
      productAuditRules: [],
      statusRules: [],
      violationWords: [],
    },
    appSettings: { siliconFlowApiKey: '' },
    notificationPreference: {
      inAppEnabled: true,
      topicEnabled: {},
      domainEnabled: {},
    },
    orderSyncStates: {},
    updatedAt: 1,
  } as any);
  await extensionDb.accountLogs.bulkPut([
    {
      id: 'old-listing-log',
      accountId: 'account-1',
      kind: 'listing',
      timestamp: 1,
      entry: { id: 'old-listing-log', timestamp: 1 },
    } as any,
    {
      id: 'new-audit-log',
      accountId: 'account-1',
      kind: 'productAudit',
      timestamp: 2,
      entry: { id: 'new-audit-log', timestamp: 2 },
    },
  ]);

  await cleanupProductAuditLegacyData();

  const workspace = await extensionDb.accountWorkspaces.get('account-1') as any;
  assert.equal('taskConfig' in workspace, false);
  assert.equal('skipKeywords' in workspace.rules, false);
  assert.equal('blacklistRules' in workspace.rules, false);
  assert.deepEqual(workspace.scheduledJobs, []);

  const logs = await extensionDb.accountLogs.toArray();
  assert.deepEqual(logs.map(log => log.id), ['new-audit-log']);
});
