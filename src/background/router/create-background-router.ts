import { createAccountRuntimeHandlers } from '../runtime-handlers/account-handlers';
import { createAppRuntimeHandlers } from '../runtime-handlers/app-handlers';
import { createDraftRuntimeHandlers } from '../runtime-handlers/draft-handlers';
import { createLogRuntimeHandlers } from '../runtime-handlers/log-handlers';
import { createNotificationRuntimeHandlers } from '../runtime-handlers/notification-handlers';
import { createOrderRuntimeHandlers } from '../runtime-handlers/order-handlers';
import { createOrderAssociationRuntimeHandlers } from '../runtime-handlers/order-association-handlers';
import { createPurchaseLookupRuntimeHandlers } from '../runtime-handlers/purchase-lookup-handlers';
import { createRealAddressRuntimeHandlers } from '../runtime-handlers/real-address-handlers';
import { createProductSourceRuntimeHandlers } from '../runtime-handlers/product-source-handlers';
import { createQuotaRuntimeHandlers } from '../runtime-handlers/quota-handlers';
import { createRuleRuntimeHandlers } from '../runtime-handlers/rule-handlers';
import { createSchedulerRuntimeHandlers } from '../runtime-handlers/scheduler-handlers';
import { createShippingRuntimeHandlers } from '../runtime-handlers/shipping-handlers';
import { createTaobaoWorkspaceRuntimeHandlers } from '../runtime-handlers/taobao-workspace-handlers';
import { createTaskRuntimeHandlers } from '../runtime-handlers/task-handlers';
import { createViolationRuntimeHandlers } from '../runtime-handlers/violation-handlers';
import { createLicenseRuntimeHandlers } from '../runtime-handlers/license-handlers';
import { assertFeatureAccess } from '../licensing/licensing-service';
import { clearDraftPagination, fetchDrafts, listDraft } from '../services/draft-service';
import { listOrders, searchOrders } from '../services/order-service';
import { runTask } from '../services/task-runner-service';
import { runViolationBatchScan, runViolationStep, type ScanSessionState } from '../services/violation-service';
import type { SessionManager } from '../utils/session-manager';
import { createRuntimeRouter, type RuntimeFeatureMap, type RuntimeRouter } from './runtime-router';

const FEATURE_CHANNELS = {
  'accounts:list': null,
  'accounts:add': null,
  'accounts:remove': null,
  'accounts:update': null,
  'accounts:getActive': null,
  'accounts:setActive': null,
  'config:get': null,
  'config:set': null,
  'orders:list': 'orders',
  'orders:detail': 'orders',
  'orders:search': 'orders',
  'orders:decodeAddress': 'orders',
  'orders:listDeliveryCompanies': 'shipping',
  'orders:shipFromPurchase': 'shipping',
  'orderRealAddresses:list': 'orders',
  'orderRealAddresses:get': 'orders',
  'orderRealAddresses:fetch': 'orders',
  'orderRealAddresses:refresh': 'orders',
  'orderAssociations:list': 'orders',
  'orderAssociations:set': 'orders',
  'purchaseLookup:open': 'orders',
  'purchaseLookup:getCurrentTabSession': 'orders',
  'purchaseLookup:markPageReady': 'orders',
  'purchaseLookup:reportChallenge': 'orders',
  'purchaseLookup:resolveChallenge': 'orders',
  'purchaseLookup:complete': 'orders',
  'purchaseLookup:fail': 'orders',
  'productSources:list': 'orders',
  'productSources:set': 'orders',
  'productSources:remove': 'orders',
  'drafts:fetch': 'listing',
  'drafts:list': 'listing',
  'quota:get': 'listing',
  'listingLogs:get': null,
  'listingLogs:clear': null,
  'globalLogs:list': null,
  'globalLogs:clear': null,
  'notifications:list': null,
  'notifications:markRead': null,
  'notifications:markAllRead': null,
  'notifications:clear': null,
  'notifications:getPreference': null,
  'notifications:updatePreference': null,
  'scheduledJobs:list': 'listing',
  'scheduledJobs:add': 'listing',
  'scheduledJobs:update': 'listing',
  'scheduledJobs:remove': 'listing',
  'task:run': 'listing',
  'task:stop': 'listing',
  'taskConfig:get': 'listing',
  'taskConfig:set': 'listing',
  'violation:getWords': 'violation',
  'violation:setWords': 'violation',
  'violation:batchScan': 'violation',
  'violation:scanStep': 'violation',
  'violation:batchDelete': 'violation',
  'violation:stop': 'violation',
  'blacklistRules:get': 'listing',
  'blacklistRules:getDefaultCodes': 'listing',
  'blacklistRules:set': 'listing',
  'skipKeywords:get': 'listing',
  'skipKeywords:set': 'listing',
  'statusRules:get': 'listing',
  'statusRules:set': 'listing',
  'statusRules:reset': 'listing',
  'shipping:open': 'shipping',
  'shipping:getCurrentTabSession': 'shipping',
  'shipping:markPageReady': 'shipping',
  'shipping:complete': 'shipping',
  'shipping:fail': 'shipping',
  'taobaoWorkspace:getCurrentRole': 'shipping',
  'license:get': null,
  'license:activate': null,
  'license:refresh': null,
  'license:clear': null,
  'app:version': null,
} as const satisfies RuntimeFeatureMap;

interface CreateBackgroundRouterOptions {
  taskSessions: SessionManager<void>;
  scanSessions: SessionManager<ScanSessionState>;
  getCurrentTabShippingSession: (sender?: chrome.runtime.MessageSender) => Promise<unknown>;
  getCurrentTabPurchaseLookupSession: (sender?: chrome.runtime.MessageSender) => Promise<unknown>;
}

/**
 * Runtime channel registration lives here so handlers.ts remains a thin
 * transport adapter. Feature-level authorization and business behavior stay in
 * each runtime handler or service module.
 */
export function createBackgroundRouter(options: CreateBackgroundRouterOptions): RuntimeRouter {
  return createRuntimeRouter({
    ...createAccountRuntimeHandlers({
      onAccountRemoved(accountId) {
        clearDraftPagination(accountId);
      },
    }),
    ...createOrderRuntimeHandlers({
      listOrders,
      searchOrders,
    }),
    ...createRealAddressRuntimeHandlers(),
    ...createOrderAssociationRuntimeHandlers(),
    ...createPurchaseLookupRuntimeHandlers(options.getCurrentTabPurchaseLookupSession),
    ...createDraftRuntimeHandlers({
      fetchDrafts,
      listDraft,
    }),
    ...createProductSourceRuntimeHandlers(),
    ...createShippingRuntimeHandlers(options.getCurrentTabShippingSession),
    ...createTaobaoWorkspaceRuntimeHandlers(),
    ...createSchedulerRuntimeHandlers(),
    ...createTaskRuntimeHandlers({
      runTask: (accountId, config) => runTask(accountId, config, options.taskSessions),
      stopTask(accountId) {
        options.taskSessions.stop(accountId);
      },
    }),
    ...createViolationRuntimeHandlers({
      batchScan: (accountId, limit) => runViolationBatchScan(accountId, options.scanSessions, limit),
      scanStep: (accountId, action) => runViolationStep(accountId, options.scanSessions, action),
      stop(accountId) {
        options.scanSessions.stop(accountId);
      },
    }),
    ...createRuleRuntimeHandlers(),
    ...createQuotaRuntimeHandlers(),
    ...createLogRuntimeHandlers(),
    ...createNotificationRuntimeHandlers(),
    ...createLicenseRuntimeHandlers(),
    ...createAppRuntimeHandlers(),
  }, {
    featureMap: FEATURE_CHANNELS,
    assertFeatureAccess,
  });
}
