import { installRuntimeHandlers } from '../src/background/handlers';
import { installPurchaseLookupTabCleanup } from '../src/background/purchase-lookup/purchase-lookup-session-service';
import { installProductCopyTabCleanup } from '../src/background/services/product-copy-session-service';
import { registerProductAuditScheduledJobs } from '../src/background/scheduler/product-audit-job-executor';
import {
  ensureOrderShipmentCheckScheduledJob,
  installOrderShipmentCheckDispatchListener,
  registerOrderShipmentScheduledJobs,
} from '../src/background/scheduler/order-shipment-job-executor';
import { ensureOrderHistoryBackfillScheduledJob, ensureOrderSyncScheduledJob, registerOrderSyncScheduledJobs } from '../src/background/scheduler/order-sync-job-executor';
import { installScheduledJobAlarmListener, startAllScheduledJobs } from '../src/background/scheduler/scheduler-center';
import { installShippingPaymentSuccessWatcher, installShippingTabCleanup } from '../src/background/shipping/shipping-session-service';
import { migrateStore } from '../src/background/store';
import { cleanupProductAuditLegacyData } from '../src/background/store/product-audit-legacy-cleanup';
import { installTaobaoRefundTabCleanup } from '../src/background/taobao-refund/taobao-refund-session-service';
import { installTaobaoWorkTabCleanup } from '../src/background/taobao-workspace/work-tab-service';

export default defineBackground(() => {
  registerProductAuditScheduledJobs();
  registerOrderShipmentScheduledJobs();
  registerOrderSyncScheduledJobs();
  installRuntimeHandlers();
  installShippingTabCleanup();
  installShippingPaymentSuccessWatcher();
  installPurchaseLookupTabCleanup();
  installProductCopyTabCleanup();
  installTaobaoRefundTabCleanup();
  installTaobaoWorkTabCleanup();
  installOrderShipmentCheckDispatchListener();
  installScheduledJobAlarmListener();
  void migrateStore().then(async () => {
    await cleanupProductAuditLegacyData();
    await ensureOrderSyncScheduledJob();
    await ensureOrderHistoryBackfillScheduledJob();
    await ensureOrderShipmentCheckScheduledJob();
    await startAllScheduledJobs();
  });

  chrome.action.onClicked.addListener(async () => {
    const dashboardUrl = chrome.runtime.getURL('/dashboard.html');
    const tabs = await chrome.tabs.query({ url: dashboardUrl });
    if (tabs[0]?.id) {
      await chrome.tabs.update(tabs[0].id, { active: true });
      if (tabs[0].windowId) await chrome.windows.update(tabs[0].windowId, { focused: true });
      return;
    }
    await chrome.tabs.create({ url: dashboardUrl });
  });
});
