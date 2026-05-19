import { installRuntimeHandlers } from '../src/background/handlers';
import { installAlarmListener, startAllTasks } from '../src/background/scheduler/listing-scheduler';
import { installShippingTabCleanup } from '../src/background/shipping/shipping-session-service';
import { migrateStore } from '../src/background/store';

export default defineBackground(() => {
  installRuntimeHandlers();
  installShippingTabCleanup();
  installAlarmListener();
  void migrateStore().then(() => startAllTasks());

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
