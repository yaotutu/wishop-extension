import type { ComplianceScanResult, ScanItem } from '../../shared/types';
import {
  createComplianceScanner,
  DeleteResultAction,
  DraftBoxScanSource,
  SubstringMatcher,
  TitleFieldExtractor,
} from '../compliance';
import type { ActionResultContext, ComplianceScanner, ScanPlan } from '../compliance';
import { getAccount } from '../store/account-repository';
import { createScopedComplianceLog } from '../store/log-repository';
import { resolveScanWords } from '../store/violation-word-repository';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';
import type { SessionManager } from '../utils/session-manager';
import { getListingClient } from '../wxshop/client-registry';

/**
 * 「商品合规扫描」逐个推进会话状态。
 * scanner 的 generator 在第一次扫描时建立，每次 scanStep 推进一条。
 * current 指向最近一次命中的商品（含命中明细），供逐个模式决策删除/跳过。
 * runId 是本次会话的执行日志归组 ID，删除处置时复用它写日志。
 */
export interface ScanSessionState {
  generator: AsyncGenerator<ScanItem> | null;
  /** 最近一次命中的商品。逐个模式删除时作用在这个商品上。 */
  current: ScanItem | null;
  done: boolean;
  /** 本次会话的 runId，删除处置日志用它归组。 */
  runId?: string;
  /** 已扫描的商品总数（含未命中），用于逐个模式弹窗展示进度。 */
  scanned: number;
}

/**
 * 扫描器单例。无状态，所有扫描任务共用同一个 scanner 实例。
 */
const scanner: ComplianceScanner = createComplianceScanner();

/**
 * 组装默认扫描计划。
 *
 * 当前默认配置等价重构前的行为：
 * - 数据源 = 草稿箱
 * - 字段 = 只扫标题
 * - 匹配 = 子串匹配
 * - 处置 = 删除草稿（由逐个模式或批量删除时触发，不在 scanner 内执行）
 *
 * 后续想开新能力（扫描述/扫上架/导出），只换这里对应的实现即可，
 * 其它代码（scanner、消费侧）不动。
 */
function buildDefaultPlan(limit?: number): ScanPlan {
  return {
    source: new DraftBoxScanSource(),
    fields: new TitleFieldExtractor(),
    matcher: new SubstringMatcher(),
    action: new DeleteResultAction(),
    limit,
  };
}

/**
 * 批量扫描某个店铺的草稿箱，一次性返回所有命中违禁词的商品。
 * 词库来源是全局通用违禁词库（resolveScanWords），与账号无关。
 *
 * 批量模式只收集 ScanItem，不执行处置（删除）。删除由前端用户勾选后
 * 单独触发 compliance:batchDelete。这样收集与处置彻底分离。
 */
export async function runComplianceBatchScan(
  accountId: string,
  scanSessions: SessionManager<ScanSessionState>,
  limit?: number,
): Promise<ComplianceScanResult> {
  const logger = createDiagnosticLogger({ domain: 'compliance', component: 'Compliance', accountId });
  const words = await resolveScanWords();
  const account = await getAccount(accountId);
  logger.info(`批量扫描开始 店铺=${account?.name || '未知'} 账号=${accountId} 词库=${words.length}个 上限=${limit || '全部'}`);
  if (words.length === 0) return { scanned: 0, violations: [], errors: 0, stopped: false, reason: '词库为空' };

  const addLog = createScopedComplianceLog(accountId);
  const plan = buildDefaultPlan(limit);
  const runId = Date.now().toString();
  addLog({ runId, productId: '', productTitle: `开始违禁词检测，词库共 ${words.length} 个词`, action: 'check', status: 'success' });

  const signal = scanSessions.start(accountId, { generator: null, current: null, done: false, scanned: 0 });
  const violations: ScanItem[] = [];
  let scanned = 0;
  let stopped = false;

  try {
    for await (const item of scanner.scan(accountId, plan, words, signal)) {
      scanned++;
      if (item.matches.length > 0) {
        const matchedWords = Array.from(new Set(item.matches.map(m => m.word))).join(', ');
        addLog({
          runId,
          productId: item.productId,
          productTitle: item.title,
          action: 'check',
          status: 'failed',
          errorMsg: `匹配到违禁词: ${matchedWords}`,
        });
        violations.push(item);
      }
      if (scanned % 30 === 0) {
        addLog({ runId, productId: '', productTitle: `已扫描 ${scanned} 条商品`, action: 'check', status: 'success' });
      }
      if (limit && scanned >= limit) {
        addLog({ runId, productId: '', productTitle: `已达到扫描上限 ${limit} 条，停止扫描`, action: 'check', status: 'success' });
        break;
      }
    }
    if (signal.aborted) stopped = true;
  } finally {
    scanSessions.complete(accountId);
  }

  addLog({
    runId,
    productId: '',
    productTitle: `扫描完成: 共扫描 ${scanned} 条，发现 ${violations.length} 条命中违禁词`,
    action: 'check',
    status: violations.length > 0 ? 'failed' : 'success',
  });

  return {
    scanned,
    violations,
    errors: 0,
    stopped,
    reason: stopped ? '用户手动停止' : undefined,
  };
}

/**
 * 逐个推进扫描，每发现一条违规商品就暂停，等待用户决策（跳过/删除/停止）。
 * action='delete' 时对 current 命中商品执行删除处置。
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
    const account = await getAccount(accountId);
    logger.info(`逐个扫描开始 店铺=${account?.name || '未知'} 账号=${accountId} 词库=${words.length}个`);
    const signal = scanSessions.start(accountId, { generator: null, current: null, done: false, scanned: 0 });
    session = scanSessions.get(accountId)!;
    const plan = buildDefaultPlan();
    const runId = Date.now().toString();
    const addLog = createScopedComplianceLog(accountId);
    addLog({ runId, productId: '', productTitle: `开始违禁词检测，词库共 ${words.length} 个词`, action: 'check', status: 'success' });
    session.state.generator = scanUntilViolation(scanner, accountId, plan, words, signal, session.state);
    session.state.runId = runId;
  }

  // action='delete' 时先删除当前命中的商品
  if (action === 'delete' && session.state.current) {
    const runId = session.state.runId ?? Date.now().toString();
    const api = await getListingClient(accountId);
    const addLog = createScopedComplianceLog(accountId);
    const ctx: ActionResultContext = { accountId, api, addLog, runId };
    const result = await new DeleteResultAction().apply(session.state.current, ctx);
    if (result?.status === 'stopped') {
      session.state.done = true;
      scanSessions.stop(accountId);
      return { type: 'stopped', reason: '删除触发全局限制' };
    }
  }

  const next = await session.state.generator!.next();
  if (next.done) {
    session.state.done = true;
    scanSessions.complete(accountId);
    return { type: 'done', scanned: session.state.scanned };
  }
  session.state.current = next.value;
  return { type: 'violation', scanned: session.state.scanned, ...next.value };
}

/**
 * 包装 scanner generator，跳过未命中的商品，只 yield 命中的。
 * 这样逐个模式的 generator 只在遇到违规商品时暂停，等用户决策。
 * 同时累加 session.scanned 计数，供逐个模式弹窗展示「已扫描 N 条」。
 */
async function* scanUntilViolation(
  scanner: ComplianceScanner,
  accountId: string,
  plan: ScanPlan,
  words: string[],
  signal: AbortSignal,
  session: ScanSessionState,
): AsyncGenerator<ScanItem> {
  for await (const item of scanner.scan(accountId, plan, words, signal)) {
    session.scanned++;
    if (item.matches.length > 0) {
      yield item;
    }
  }
}
