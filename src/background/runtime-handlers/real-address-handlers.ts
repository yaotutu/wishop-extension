import type { RuntimeHandlerMap } from '../router/runtime-router';
import { fetchAndCacheRealAddress, getCachedRealAddress, listRealAddressCaches } from '../services/real-address-service';

export function createRealAddressRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'orderRealAddresses:list'(args) {
      return listRealAddressCaches(args[0] as string);
    },
    async 'orderRealAddresses:get'(args) {
      return getCachedRealAddress(args[0] as string, args[1] as string);
    },
    async 'orderRealAddresses:fetch'(args) {
      return fetchAndCacheRealAddress(args[0] as string, args[1] as string);
    },
    async 'orderRealAddresses:refresh'(args) {
      return fetchAndCacheRealAddress(args[0] as string, args[1] as string);
    },
  };
}
