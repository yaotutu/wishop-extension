import type { AppSettingsPatch } from '../../shared/settings';
import { ensureOrderShipmentCheckScheduledJob } from '../scheduler/order-shipment-job-executor';
import { startScheduledJob } from '../scheduler/scheduler-center';
import { getAppSettings, updateAppSettings } from '../store/settings-repository';
import type { RuntimeHandlerMap } from '../router/runtime-router';

export function createSettingsRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'settings:get'() {
      return getAppSettings();
    },
    async 'settings:update'(args) {
      const settings = await updateAppSettings(args[0] as AppSettingsPatch);
      const job = await ensureOrderShipmentCheckScheduledJob();
      if (job) await startScheduledJob(job);
      return settings;
    },
  };
}
