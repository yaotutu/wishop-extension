import type { ViolationMatch } from '../../shared/types';
import { createScopedComplianceLog } from '../store/log-repository';
import { getListingClient } from '../wxshop/client-registry';
import { batchDeleteViolations } from '../modules/compliance-detect';
import type { RuntimeHandlerMap } from '../router/runtime-router';

/**
 * 「商品合规扫描」相关的 runtime handler 依赖。
 * batchScan / scanStep / stop 由 service 层注入，handler 只负责参数透传。
 */
interface ComplianceHandlerDeps {
  batchScan: (accountId: string, limit?: number) => Promise<unknown>;
  scanStep: (accountId: string, action: 'next' | 'skip' | 'delete') => Promise<unknown>;
  stop: (accountId: string) => void;
}

/**
 * 注册「商品合规扫描」执行类 channel（扫描、逐个推进、批量删除、停止）。
 * 词库读写不在这一层，走独立的 violationWords:* channel。
 */
export function createComplianceRuntimeHandlers(deps: ComplianceHandlerDeps): RuntimeHandlerMap {
  return {
    async 'compliance:batchScan'(args) {
      return deps.batchScan(args[0] as string, args[1] as number | undefined);
    },
    async 'compliance:scanStep'(args) {
      return deps.scanStep(args[0] as string, args[1] as 'next' | 'skip' | 'delete');
    },
    async 'compliance:batchDelete'(args) {
      return batchDeleteViolations(
        await getListingClient(args[0] as string),
        createScopedComplianceLog(args[0] as string),
        args[1] as ViolationMatch[],
        Date.now().toString(),
        args[0] as string,
      );
    },
    async 'compliance:stop'(args) {
      deps.stop(args[0] as string);
      return undefined;
    },
  };
}
