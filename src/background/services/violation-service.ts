import type { ViolationMatch, ViolationScanResult } from '../../shared/types';
import { batchDeleteViolations, batchScan, scanOneByOne } from '../modules/violation-detect';
import { getAccount } from '../store/account-repository';
import { createScopedViolationLog } from '../store/log-repository';
import { getViolationWords } from '../store/rule-repository';
import { createLogger } from '../utils/logger';
import type { SessionManager } from '../utils/session-manager';
import { getClient } from '../wxshop/client-registry';

export interface ScanSessionState {
  generator: AsyncGenerator<ViolationMatch & { scanned: number }> | null;
  current: (ViolationMatch & { scanned: number }) | null;
  done: boolean;
}

export async function runViolationBatchScan(
  accountId: string,
  scanSessions: SessionManager<ScanSessionState>,
  limit?: number,
): Promise<ViolationScanResult> {
  const logger = createLogger('Violation', accountId);
  const words = await getViolationWords(accountId);
  const account = await getAccount(accountId);
  const api = await getClient(accountId);
  logger.info(`批量扫描开始 店铺=${account?.name || '未知'} 账号=${accountId} 词库=${words.length}个 上限=${limit || '全部'}`);
  if (words.length === 0) return { scanned: 0, violations: [], errors: 0, stopped: false, reason: '词库为空' };

  const signal = scanSessions.start(accountId, { generator: null, current: null, done: false });
  try {
    return await batchScan(api, createScopedViolationLog(accountId), words, Date.now().toString(), signal, limit, accountId);
  } finally {
    scanSessions.complete(accountId);
  }
}

export async function runViolationStep(
  accountId: string,
  scanSessions: SessionManager<ScanSessionState>,
  action: 'next' | 'skip' | 'delete',
): Promise<unknown> {
  const logger = createLogger('Violation', accountId);
  let session = scanSessions.get(accountId);
  if (!session || session.state.done) {
    const words = await getViolationWords(accountId);
    if (words.length === 0) return { type: 'done', reason: '词库为空' };
    const api = await getClient(accountId);
    const account = await getAccount(accountId);
    logger.info(`逐个扫描开始 店铺=${account?.name || '未知'} 账号=${accountId} 词库=${words.length}个`);
    const signal = scanSessions.start(accountId, { generator: null, current: null, done: false });
    session = scanSessions.get(accountId)!;
    session.state.generator = scanOneByOne(api, createScopedViolationLog(accountId), words, Date.now().toString(), signal, accountId);
  }

  if (action === 'delete' && session.state.current) {
    const result = await batchDeleteViolations(await getClient(accountId), createScopedViolationLog(accountId), [session.state.current], Date.now().toString(), accountId);
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
