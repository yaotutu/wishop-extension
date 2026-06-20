import type { ViolationMatch, ViolationScanResult } from '../../shared/types';
import { batchDeleteViolations, batchScan, scanOneByOne } from '../modules/compliance-detect';
import { getAccount } from '../store/account-repository';
import { createScopedComplianceLog } from '../store/log-repository';
import { resolveScanWords } from '../store/violation-word-repository';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';
import type { SessionManager } from '../utils/session-manager';
import { getListingClient } from '../wxshop/client-registry';

/**
 * 「商品合规扫描」逐个推进会话状态。
 * generator 在第一次扫描时建立，每次 scanStep 推进一条。
 */
export interface ScanSessionState {
  generator: AsyncGenerator<ViolationMatch & { scanned: number }> | null;
  current: (ViolationMatch & { scanned: number }) | null;
  done: boolean;
}

/**
 * 批量扫描某个店铺的草稿箱，一次性返回所有命中违禁词的商品。
 * 词库来源是全局通用违禁词库（resolveScanWords），与账号无关。
 */
export async function runComplianceBatchScan(
  accountId: string,
  scanSessions: SessionManager<ScanSessionState>,
  limit?: number,
): Promise<ViolationScanResult> {
  const logger = createDiagnosticLogger({ domain: 'compliance', component: 'Compliance', accountId });
  const words = await resolveScanWords();
  const account = await getAccount(accountId);
  const api = await getListingClient(accountId);
  logger.info(`批量扫描开始 店铺=${account?.name || '未知'} 账号=${accountId} 词库=${words.length}个 上限=${limit || '全部'}`);
  if (words.length === 0) return { scanned: 0, violations: [], errors: 0, stopped: false, reason: '词库为空' };

  const signal = scanSessions.start(accountId, { generator: null, current: null, done: false });
  try {
    return await batchScan(api, createScopedComplianceLog(accountId), words, Date.now().toString(), signal, limit, accountId);
  } finally {
    scanSessions.complete(accountId);
  }
}

/**
 * 逐个推进扫描，每发现一条违规商品就暂停，等待用户决策（跳过/删除/停止）。
 */
export async function runComplianceStep(
  accountId: string,
  scanSessions: SessionManager<ScanSessionState>,
  action: 'next' | 'skip' | 'delete',
): Promise<unknown> {
  const logger = createDiagnosticLogger({ domain: 'compliance', component: 'Compliance', accountId });
  let session = scanSessions.get(accountId);
  if (!session || session.state.done) {
    const words = await resolveScanWords();
    if (words.length === 0) return { type: 'done', reason: '词库为空' };
    const api = await getListingClient(accountId);
    const account = await getAccount(accountId);
    logger.info(`逐个扫描开始 店铺=${account?.name || '未知'} 账号=${accountId} 词库=${words.length}个`);
    const signal = scanSessions.start(accountId, { generator: null, current: null, done: false });
    session = scanSessions.get(accountId)!;
    session.state.generator = scanOneByOne(api, createScopedComplianceLog(accountId), words, Date.now().toString(), signal, accountId);
  }

  if (action === 'delete' && session.state.current) {
    const result = await batchDeleteViolations(await getListingClient(accountId), createScopedComplianceLog(accountId), [session.state.current], Date.now().toString(), accountId);
    if (result.stopped) {
      session.state.done = true;
      scanSessions.stop(accountId);
      return { type: 'stopped', reason: '删除触发全局限制' };
    }
  }

  const next = await session.state.generator!.next();
  if (next.done) {
    session.state.done = true;
    scanSessions.complete(accountId);
    return { type: 'done', scanned: session.state.current?.scanned || 0 };
  }
  session.state.current = next.value;
  return { type: 'violation', ...next.value };
}
