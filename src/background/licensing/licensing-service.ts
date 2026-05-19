import type { LicenseActivationInput, LicensedFeature, LicenseState } from '../../shared/types';
import { getLicenseState, setLicenseState } from '../store/license-repository';

/**
 * All paid-feature checks should pass through this function instead of being
 * scattered across pages or content scripts. Until the license backend exists,
 * enforcementEnabled stays false and this function records structure without
 * blocking real merchant workflows.
 */
export async function assertFeatureAccess(_feature: LicensedFeature): Promise<void> {
  const state = await getLicenseState();
  if (!state.enforcementEnabled) return;
  if (state.status !== 'active' && state.status !== 'grace') {
    throw new Error('当前授权不可用，请完成软件激活后继续使用');
  }
}

export async function getEntitlement(): Promise<LicenseState> {
  return getLicenseState();
}

export async function activateLicense(input: LicenseActivationInput): Promise<LicenseState> {
  const licenseKey = input.licenseKey.trim();
  if (!licenseKey) throw new Error('请输入激活码');

  // Placeholder activation: keeps the local model ready without calling a
  // backend that does not exist yet. It is intentionally not enforced.
  return setLicenseState({
    licenseKey,
    status: 'active',
    plan: 'paid',
    activatedAt: Date.now(),
    checkedAt: Date.now(),
    lastError: undefined,
    enforcementEnabled: false,
  });
}

export async function clearLicense(): Promise<LicenseState> {
  return setLicenseState({
    licenseKey: undefined,
    status: 'inactive',
    plan: 'none',
    activatedAt: undefined,
    expiresAt: undefined,
    checkedAt: Date.now(),
    lastError: undefined,
    enforcementEnabled: false,
  });
}

export async function refreshLicense(): Promise<LicenseState> {
  const state = await getLicenseState();
  return setLicenseState({
    checkedAt: Date.now(),
    status: state.licenseKey ? state.status : 'inactive',
    lastError: undefined,
    enforcementEnabled: false,
  });
}
