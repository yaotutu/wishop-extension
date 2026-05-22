import { installRuntimeHandlers } from '../src/background/handlers';
import { installPurchaseLookupTabCleanup } from '../src/background/purchase-lookup/purchase-lookup-session-service';
import { registerListingScheduledJobs } from '../src/background/scheduler/listing-job-executor';
import {
  ensureOrderShipmentCheckScheduledJob,
  installOrderShipmentCheckDispatchListener,
  registerOrderShipmentScheduledJobs,
} from '../src/background/scheduler/order-shipment-job-executor';
import { installScheduledJobAlarmListener, startAllScheduledJobs } from '../src/background/scheduler/scheduler-center';
import { installShippingPaymentSuccessWatcher, installShippingTabCleanup } from '../src/background/shipping/shipping-session-service';
import { migrateStore } from '../src/background/store';
import { installTaobaoRefundTabCleanup } from '../src/background/taobao-refund/taobao-refund-session-service';
import { installTaobaoWorkTabCleanup } from '../src/background/taobao-workspace/work-tab-service';

export default defineBackground(() => {
  registerListingScheduledJobs();
  registerOrderShipmentScheduledJobs();
  installRuntimeHandlers();
  installShippingTabCleanup();
  installShippingPaymentSuccessWatcher();
  installPurchaseLookupTabCleanup();
  installTaobaoRefundTabCleanup();
  installTaobaoWorkTabCleanup();
  installOrderShipmentCheckDispatchListener();
  installScheduledJobAlarmListener();
  void migrateStore().then(async () => {
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
