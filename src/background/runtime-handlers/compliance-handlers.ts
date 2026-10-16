import type { ScanItem } from '../../shared/types';
import { DeleteResultAction, type ActionResultContext } from '../compliance';
import { createScopedComplianceLog } from '../store/log-repository';
import { getListingClient } from '../wxshop/client-registry';
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
    /**
     * 批量删除选中的命中商品。
     * 处置走 DeleteResultAction，循环 apply 每条 ScanItem。
     * 命中微信全局限制（errcode 10020208/10020247）时提前停止并返回 stopped。
     */
    async 'compliance:batchDelete'(args) {
      const accountId = args[0] as string;
      const items = args[1] as ScanItem[];
      const api = await getListingClient(accountId);
      const addLog = createScopedComplianceLog(accountId);
      const runId = Date.now().toString();
      const ctx: ActionResultContext = { accountId, api, addLog, runId };
      const action = new DeleteResultAction();

      let deleted = 0;
      let errors = 0;
      let stopped = false;
      for (const item of items) {
        const result = await action.apply(item, ctx);
        if (result.status === 'success') {
          deleted++;
        } else if (result.status === 'stopped') {
          stopped = true;
          break;
        } else {
          errors++;
        }
      }
      return { deleted, errors, stopped };
    },
    async 'compliance:stop'(args) {
      deps.stop(args[0] as string);
      return undefined;
    },
  };
}
