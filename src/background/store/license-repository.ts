import { v4 as uuidv4 } from 'uuid';
import type { LicenseState } from '../../shared/types';

const LICENSE_STORAGE_KEY = 'licenseState';

function createDefaultLicenseState(): LicenseState {
  return {
    enforcementEnabled: false,
    status: 'inactive',
    plan: 'none',
    deviceId: uuidv4(),
  };
}

export async function getLicenseState(): Promise<LicenseState> {
  const data = await chrome.storage.local.get(LICENSE_STORAGE_KEY);
  const stored = data[LICENSE_STORAGE_KEY] as Partial<LicenseState> | undefined;
  return {
    ...createDefaultLicenseState(),
    ...stored,
    // Keep enforcement disabled until the paid backend is ready. This flag is
    // the single switch that turns structural license checks into real gates.
    enforcementEnabled: stored?.enforcementEnabled === true,
  };
}

export async function setLicenseState(patch: Partial<LicenseState>): Promise<LicenseState> {
  const next = { ...(await getLicenseState()), ...patch };
  await chrome.storage.local.set({ [LICENSE_STORAGE_KEY]: next });
  return next;
}
