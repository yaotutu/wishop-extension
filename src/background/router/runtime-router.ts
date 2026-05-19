import type { LicensedFeature } from '../../shared/types';
import type { RuntimeChannel } from '../../shared/runtime-channels';

export type RuntimeChannelHandler = (args: unknown[], sender?: chrome.runtime.MessageSender) => Promise<unknown>;

export type RuntimeHandlerMap = Partial<Record<RuntimeChannel, RuntimeChannelHandler>>;

export type RuntimeFeatureMap = Partial<Record<RuntimeChannel, LicensedFeature>>;

export interface RuntimeRouter {
  resolve(channel: string): RuntimeChannelHandler | undefined;
}

interface RuntimeRouterOptions {
  featureMap?: RuntimeFeatureMap;
  assertFeatureAccess?: (feature: LicensedFeature) => Promise<void>;
}

/**
 * Central runtime-message router. Feature modules register channel handlers
 * here so new domains do not keep expanding the legacy switch in handlers.ts.
 */
export function createRuntimeRouter(handlers: RuntimeHandlerMap, options: RuntimeRouterOptions = {}): RuntimeRouter {
  return {
    resolve(channel: string) {
      const handler = handlers[channel as RuntimeChannel];
      if (!handler) return undefined;
      const feature = options.featureMap?.[channel as RuntimeChannel];
      if (!feature || !options.assertFeatureAccess) return handler;
      return async (args, sender) => {
        await options.assertFeatureAccess!(feature);
        return handler(args, sender);
      };
    },
  };
}
