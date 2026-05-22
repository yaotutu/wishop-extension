import type { AppSettings, AppSettingsPatch } from '../../shared/settings';
import { normalizeAppSettings } from '../../shared/settings';
import { readStore, writeStore } from './core';

export async function getAppSettings(): Promise<AppSettings> {
  return normalizeAppSettings((await readStore()).appSettings);
}

export async function updateAppSettings(patch: AppSettingsPatch): Promise<AppSettings> {
  const store = await readStore();
  const next = normalizeAppSettings({
    ...store.appSettings,
    ...patch,
    shipmentCheck: {
      ...store.appSettings?.shipmentCheck,
      ...patch.shipmentCheck,
    },
  });
  await writeStore({ appSettings: next });
  return next;
}
