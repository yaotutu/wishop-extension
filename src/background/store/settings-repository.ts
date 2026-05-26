import type { AppSettings, AppSettingsPatch } from '../../shared/settings';
import { normalizeAppSettings } from '../../shared/settings';
import { ensureAccountWorkspace, updateAccountWorkspace } from './workspace-repository.ts';

const APP_SETTINGS_WORKSPACE_ID = '__app_settings__';

export async function getAppSettings(): Promise<AppSettings> {
  return normalizeAppSettings((await ensureAccountWorkspace(APP_SETTINGS_WORKSPACE_ID)).appSettings);
}

export async function updateAppSettings(patch: AppSettingsPatch): Promise<AppSettings> {
  const current = await getAppSettings();
  const next = normalizeAppSettings({
    ...current,
    ...patch,
    shipmentCheck: {
      ...current.shipmentCheck,
      ...patch.shipmentCheck,
    },
  });
  await updateAccountWorkspace(APP_SETTINGS_WORKSPACE_ID, workspace => {
    workspace.appSettings = next;
  });
  return next;
}
