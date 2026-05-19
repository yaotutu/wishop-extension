import type { ViolationMatch } from '../../shared/types';
import { createScopedAddLog } from '../store/log-repository';
import { getViolationWords, setViolationWords } from '../store/rule-repository';
import { getClient } from '../wxshop/client-registry';
import { batchDeleteViolations } from '../modules/violation-detect';
import type { RuntimeHandlerMap } from '../router/runtime-router';

interface ViolationHandlerDeps {
  batchScan: (accountId: string, limit?: number) => Promise<unknown>;
  scanStep: (accountId: string, action: 'next' | 'skip' | 'delete') => Promise<unknown>;
  stop: (accountId: string) => void;
}

export function createViolationRuntimeHandlers(deps: ViolationHandlerDeps): RuntimeHandlerMap {
  return {
    async 'violation:getWords'(args) {
      return getViolationWords(args[0] as string);
    },
    async 'violation:setWords'(args) {
      return setViolationWords(args[0] as string, args[1] as string[]);
    },
    async 'violation:batchScan'(args) {
      return deps.batchScan(args[0] as string, args[1] as number | undefined);
    },
    async 'violation:scanStep'(args) {
      return deps.scanStep(args[0] as string, args[1] as 'next' | 'skip' | 'delete');
    },
    async 'violation:batchDelete'(args) {
      return batchDeleteViolations(
        await getClient(args[0] as string),
        createScopedAddLog(args[0] as string),
        args[1] as ViolationMatch[],
        Date.now().toString(),
        args[0] as string,
      );
    },
    async 'violation:stop'(args) {
      deps.stop(args[0] as string);
      return undefined;
    },
  };
}
