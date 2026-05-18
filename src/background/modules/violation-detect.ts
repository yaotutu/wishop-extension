import { WxShopClient } from '../wxshop/client';
import type { AddLogFn, ViolationMatch, ViolationScanResult } from '../../shared/types';
import { streamDraftProducts } from './fetch-draft-products';
import { batchDelete } from './delete-failed-products';
import { createLogger } from '../utils/logger';

export function findMatches(title: string, words: string[]): string[] {
  const lower = title.toLowerCase();
  return words.filter(w => w && lower.includes(w.toLowerCase()));
}

export async function* scanOneByOne(
  api: WxShopClient,
  addLog: AddLogFn,
  words: string[],
  runId: string,
  signal?: AbortSignal,
  accountId: string = '',
): AsyncGenerator<ViolationMatch & { scanned: number }> {
  const logger = createLogger('ViolationScan', accountId);
  logger.info(`开始违规词检测，词库共 ${words.length} 个词`);
  addLog({ runId, productId: '', productTitle: `开始违规词检测，词库共 ${words.length} 个词`, action: 'check', status: 'success' });
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
      logger.info(`↑ 匹配违规词: [${matched.join(', ')}]`);
      addLog({
        runId,
        productId: product.productId,
        productTitle: product.title,
        action: 'check',
        status: 'failed',
        errorMsg: `匹配到违规词: ${matched.join(', ')}`,
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

export async function batchScan(
  api: WxShopClient,
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

  addLog({ runId, productId: '', productTitle: `扫描完成: 共扫描 ${result.scanned} 条，发现 ${result.violations.length} 条违规`, action: 'check', status: result.violations.length > 0 ? 'failed' : 'success' });
  return result;
}

export { batchDelete as batchDeleteViolations };
