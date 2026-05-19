import { createAccountRuntimeHandlers } from '../runtime-handlers/account-handlers';
import { createAppRuntimeHandlers } from '../runtime-handlers/app-handlers';
import { createDraftRuntimeHandlers } from '../runtime-handlers/draft-handlers';
import { createLogRuntimeHandlers } from '../runtime-handlers/log-handlers';
import { createOrderRuntimeHandlers } from '../runtime-handlers/order-handlers';
import { createOrderAssociationRuntimeHandlers } from '../runtime-handlers/order-association-handlers';
import { createRealAddressRuntimeHandlers } from '../runtime-handlers/real-address-handlers';
import { createProductSourceRuntimeHandlers } from '../runtime-handlers/product-source-handlers';
import { createQuotaRuntimeHandlers } from '../runtime-handlers/quota-handlers';
import { createRuleRuntimeHandlers } from '../runtime-handlers/rule-handlers';
import { createSchedulerRuntimeHandlers } from '../runtime-handlers/scheduler-handlers';
import { createShippingRuntimeHandlers } from '../runtime-handlers/shipping-handlers';
import { createTaskRuntimeHandlers } from '../runtime-handlers/task-handlers';
import { createViolationRuntimeHandlers } from '../runtime-handlers/violation-handlers';
import { createLicenseRuntimeHandlers } from '../runtime-handlers/license-handlers';
import { assertFeatureAccess } from '../licensing/licensing-service';
import { clearDraftPagination, fetchDrafts, listDraft } from '../services/draft-service';
import { listOrders, searchOrders } from '../services/order-service';
import { runTask } from '../services/task-runner-service';
import { runViolationBatchScan, runViolationStep, type ScanSessionState } from '../services/violation-service';
import type { SessionManager } from '../utils/session-manager';
import { createRuntimeRouter, type RuntimeRouter } from './runtime-router';

const FEATURE_CHANNELS = {
  'orders:list': 'orders',
  'orders:detail': 'orders',
  'orders:search': 'orders',
  'orders:decodeAddress': 'orders',
  'orderRealAddresses:list': 'orders',
  'orderRealAddresses:get': 'orders',
  'orderRealAddresses:fetch': 'orders',
  'orderRealAddresses:refresh': 'orders',
  'orderAssociations:list': 'orders',
  'orderAssociations:set': 'orders',
  'drafts:fetch': 'listing',
  'drafts:list': 'listing',
  'quota:get': 'listing',
  'task:run': 'listing',
  'scheduler:add': 'listing',
  'scheduler:update': 'listing',
  'globalScheduler:add': 'listing',
  'globalScheduler:update': 'listing',
  'violation:batchScan': 'violation',
  'violation:scanStep': 'violation',
  'violation:batchDelete': 'violation',
  'shipping:open': 'shipping',
  'shipping:getCurrentTabSession': 'shipping',
  'shipping:markPageReady': 'shipping',
  'shipping:complete': 'shipping',
  'shipping:fail': 'shipping',
} as const;

interface CreateBackgroundRouterOptions {
  taskSessions: SessionManager<void>;
  scanSessions: SessionManager<ScanSessionState>;
  getCurrentTabShippingSession: (sender?: chrome.runtime.MessageSender) => Promise<unknown>;
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
    ...createDraftRuntimeHandlers({
      fetchDrafts,
      listDraft,
    }),
    ...createProductSourceRuntimeHandlers(),
    ...createShippingRuntimeHandlers(options.getCurrentTabShippingSession),
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
    ...createLicenseRuntimeHandlers(),
    ...createAppRuntimeHandlers(),
  }, {
    featureMap: FEATURE_CHANNELS,
    assertFeatureAccess,
  });
}
