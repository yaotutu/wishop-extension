import { createAccountRuntimeHandlers } from '../runtime-handlers/account-handlers';
import { createAppRuntimeHandlers } from '../runtime-handlers/app-handlers';
import { createDraftRuntimeHandlers } from '../runtime-handlers/draft-handlers';
import { createLogRuntimeHandlers } from '../runtime-handlers/log-handlers';
import { createNotificationRuntimeHandlers } from '../runtime-handlers/notification-handlers';
import { createOrderRuntimeHandlers } from '../runtime-handlers/order-handlers';
import { createOrderAssociationRuntimeHandlers } from '../runtime-handlers/order-association-handlers';
import { createPurchaseLookupRuntimeHandlers } from '../runtime-handlers/purchase-lookup-handlers';
import { createRealAddressRuntimeHandlers } from '../runtime-handlers/real-address-handlers';
import { createProductRuntimeHandlers } from '../runtime-handlers/product-handlers';
import { createProductListingCollectionRuntimeHandlers } from '../runtime-handlers/product-listing-collection-handlers';
import { createProductAuditRuntimeHandlers } from '../runtime-handlers/product-audit-handlers';
import { createProductSourceRuntimeHandlers } from '../runtime-handlers/product-source-handlers';
import { createQuotaRuntimeHandlers } from '../runtime-handlers/quota-handlers';
import { createRuleRuntimeHandlers } from '../runtime-handlers/rule-handlers';
import { createSchedulerRuntimeHandlers } from '../runtime-handlers/scheduler-handlers';
import { createSettingsRuntimeHandlers } from '../runtime-handlers/settings-handlers';
import { createShippingRuntimeHandlers } from '../runtime-handlers/shipping-handlers';
import { createTaobaoWorkspaceRuntimeHandlers } from '../runtime-handlers/taobao-workspace-handlers';
import { createTaobaoRefundRuntimeHandlers } from '../runtime-handlers/taobao-refund-handlers';
import { createViolationRuntimeHandlers } from '../runtime-handlers/violation-handlers';
import { createLicenseRuntimeHandlers } from '../runtime-handlers/license-handlers';
import { createWxCategoryDataRuntimeHandlers } from '../runtime-handlers/wx-category-data-handlers';
import { assertFeatureAccess } from '../licensing/licensing-service';
import { clearDraftPagination, deleteDraft, fetchDrafts, submitDraftAudit } from '../services/draft-service';
import { runProductAuditTask } from '../services/product-audit-task-service';
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
  'orders:refresh': 'orders',
  'orders:syncState': 'orders',
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
  'taobaoRefund:open': 'orders',
  'taobaoRefund:getCurrentTabSession': 'orders',
  'taobaoRefund:markPageReady': 'orders',
  'taobaoRefund:reportChallenge': 'orders',
  'taobaoRefund:resolveChallenge': 'orders',
  'taobaoRefund:prepared': 'orders',
  'taobaoRefund:submitted': 'orders',
  'taobaoRefund:fail': 'orders',
  'productSources:list': 'orders',
  'productSources:set': 'orders',
  'productSources:remove': 'orders',
  'products:getQrcode': 'orders',
  'productListingCollection:list': 'listing',
  'productListingCollection:remove': 'listing',
  'productListingCollection:open': 'listing',
  'productListingCollection:getCurrentTabSession': 'listing',
  'productListingCollection:markPageReady': 'listing',
  'productListingCollection:reportChallenge': 'listing',
  'productListingCollection:resolveChallenge': 'listing',
  'productListingCollection:complete': 'listing',
  'productListingCollection:fail': 'listing',
  'productListingCollection:suggestWxCategoryFromFullList': 'listing',
  'productListingCollection:prepareWxDraft': 'listing',
  'productListingCollection:submitPreparedWxDraft': 'listing',
  'productListingCollection:createWxDraft': 'listing',
  'wxCategoryData:downloadProductRules': 'listing',
  'wxCategoryData:getProductRuleCacheStatus': 'listing',
  'drafts:fetch': 'productAudit',
  'drafts:submitAudit': 'productAudit',
  'drafts:delete': 'productAudit',
  'quota:get': 'productAudit',
  'productAudit:logsGet': null,
  'productAudit:logsClear': null,
  'activityLogs:list': null,
  'activityLogs:clear': null,
  'notifications:list': null,
  'notifications:markRead': null,
  'notifications:markAllRead': null,
  'notifications:clear': null,
  'notifications:getPreference': null,
  'notifications:updatePreference': null,
  'settings:get': null,
  'settings:update': null,
  'scheduledJobs:list': null,
  'scheduledJobs:add': null,
  'scheduledJobs:update': null,
  'scheduledJobs:remove': null,
  'scheduledJobs:runNow': null,
  'scheduledJobs:stopRun': null,
  'productAudit:run': 'productAudit',
  'productAudit:stop': 'productAudit',
  'productAudit:configGet': 'productAudit',
  'productAudit:configSet': 'productAudit',
  'violation:getWords': 'violation',
  'violation:setWords': 'violation',
  'violation:batchScan': 'violation',
  'violation:scanStep': 'violation',
  'violation:batchDelete': 'violation',
  'violation:stop': 'violation',
  'productAudit:failurePolicyGet': 'productAudit',
  'productAudit:failurePolicyGetDefaults': 'productAudit',
  'productAudit:failurePolicySet': 'productAudit',
  'statusRules:get': 'productAudit',
  'statusRules:set': 'productAudit',
  'statusRules:reset': 'productAudit',
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
  getCurrentTabTaobaoRefundSession: (sender?: chrome.runtime.MessageSender) => Promise<unknown>;
  getCurrentTabProductListingCollectionSession: (sender?: chrome.runtime.MessageSender) => Promise<unknown>;
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
    ...createOrderRuntimeHandlers(),
    ...createRealAddressRuntimeHandlers(),
    ...createOrderAssociationRuntimeHandlers(),
    ...createPurchaseLookupRuntimeHandlers(options.getCurrentTabPurchaseLookupSession),
    ...createTaobaoRefundRuntimeHandlers(options.getCurrentTabTaobaoRefundSession),
    ...createProductListingCollectionRuntimeHandlers(options.getCurrentTabProductListingCollectionSession),
    ...createWxCategoryDataRuntimeHandlers(),
    ...createDraftRuntimeHandlers({
      fetchDrafts,
      submitDraftAudit,
      deleteDraft,
    }),
    ...createProductRuntimeHandlers(),
    ...createProductSourceRuntimeHandlers(),
    ...createShippingRuntimeHandlers(options.getCurrentTabShippingSession),
    ...createTaobaoWorkspaceRuntimeHandlers(),
    ...createSchedulerRuntimeHandlers(),
    ...createProductAuditRuntimeHandlers({
      run: (accountId, config) => runProductAuditTask(accountId, config, options.taskSessions),
      stop(accountId) {
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
    ...createSettingsRuntimeHandlers(),
    ...createLicenseRuntimeHandlers(),
    ...createAppRuntimeHandlers(),
  }, {
    featureMap: FEATURE_CHANNELS,
    assertFeatureAccess,
  });
}
