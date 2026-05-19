import type { LicenseActivationInput } from '../../shared/types';
import { activateLicense, clearLicense, getEntitlement, refreshLicense } from '../licensing/licensing-service';
import type { RuntimeHandlerMap } from '../router/runtime-router';

export function createLicenseRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'license:get'() {
      return getEntitlement();
    },
    async 'license:activate'(args) {
      return activateLicense(args[0] as LicenseActivationInput);
    },
    async 'license:refresh'() {
      return refreshLicense();
    },
    async 'license:clear'() {
      return clearLicense();
    },
  };
}
