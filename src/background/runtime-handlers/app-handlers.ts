import type { RuntimeHandlerMap } from '../router/runtime-router';

export function createAppRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'app:version'() {
      return chrome.runtime.getManifest().version;
    },
  };
}
