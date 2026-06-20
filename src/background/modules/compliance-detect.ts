import type { WxShopListingClient } from '../wxshop/listing/types';
import type { AddLogFn, ViolationMatch, ViolationScanResult } from '../../shared/types';
import { streamDraftProducts } from './fetch-draft-products';
import { batchDelete } from './delete-failed-products';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';

/**
 * 违禁词匹配核心：子串匹配，大小写不敏感。
 * 词库中的每个词只要作为子串出现在标题里就视为命中。
 */
export function findMatches(title: string, words: string[]): string[] {
  const lower = title.toLowerCase();
  return words.filter(w => w && lower.includes(w.toLowerCase()));
}

/**
 * 逐个流式扫描草稿箱商品，每命中一条违禁词就 yield 出来。
 * 只扫 editStatus === 72（微信草稿箱编辑态）的商品。
 */
export async function* scanOneByOne(
  api: WxShopListingClient,
  addLog: AddLogFn,
  words: string[],
  runId: string,
  signal?: AbortSignal,
  accountId: string = '',
): AsyncGenerator<ViolationMatch & { scanned: number }> {
  const logger = createDiagnosticLogger({ domain: 'compliance', component: 'ComplianceScan', accountId });
  logger.info(`开始违禁词检测，词库共 ${words.length} 个词`);
  addLog({ runId, productId: '', productTitle: `开始违禁词检测，词库共 ${words.length} 个词`, action: 'check', status: 'success' });
  let scanned = 0;
  for await (const product of streamDraftProducts(api, signal, accountId)) {
    if (signal?.aborted) {
      logger.info(`用户手动停止，已扫描 ${scanned} 条`);
      return;
    }
    scanned++;
    if (product.editStatus !== 72) continue;
    logger.info(`#${scanned} id=${product.productId} editStatus=${product.editStatus} ${product.title}`);
    const matched = findMatches(product.title, words);
    if (matched.length > 0) {
      logger.info(`↑ 匹配违禁词: [${matched.join(', ')}]`);
      addLog({
        runId,
        productId: product.productId,
        productTitle: product.title,
        action: 'check',
        status: 'failed',
        errorMsg: `匹配到违禁词: ${matched.join(', ')}`,
      });
      yield { productId: product.productId, title: product.title, matchedWords: matched, scanned };
    }
    if (scanned % 30 === 0) {
      logger.info(`进度: 已扫描 ${scanned} 条`);
      addLog({ runId, productId: '', productTitle: `已扫描 ${scanned} 条商品`, action: 'check', status: 'success' });
    }
  }
  logger.info(`完成: 共扫描 ${scanned} 条`);
  addLog({ runId, productId: '', productTitle: `扫描完成: 共扫描 ${scanned} 条`, action: 'check', status: 'success' });
}

/**
 * 批量扫描，收集所有命中违禁词的商品，支持扫描上限提前停止。
 */
export async function batchScan(
  api: WxShopListingClient,
  addLog: AddLogFn,
  words: string[],
  runId: string,
  signal?: AbortSignal,
  limit?: number,
  accountId: string = '',
): Promise<ViolationScanResult> {
  const result: ViolationScanResult = { scanned: 0, violations: [], errors: 0, stopped: false };
  let lastScanned = 0;

  for await (const match of scanOneByOne(api, addLog, words, runId, signal, accountId)) {
    result.violations.push({ productId: match.productId, title: match.title, matchedWords: match.matchedWords });
    lastScanned = match.scanned;
    if (limit && lastScanned >= limit) {
      addLog({ runId, productId: '', productTitle: `已达到扫描上限 ${limit} 条，停止扫描`, action: 'check', status: 'success' });
      break;
    }
  }

  result.scanned = lastScanned;
  if (signal?.aborted) {
    result.stopped = true;
    result.reason = '用户手动停止';
  }

  addLog({ runId, productId: '', productTitle: `扫描完成: 共扫描 ${result.scanned} 条，发现 ${result.violations.length} 条命中违禁词`, action: 'check', status: result.violations.length > 0 ? 'failed' : 'success' });
  return result;
}

export { batchDelete as batchDeleteViolations };
