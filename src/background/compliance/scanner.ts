import type { ComplianceScanner, ScanItem, ScanPlan } from './types';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';

/**
 * 合规扫描器默认实现。
 *
 * 把 ScanSource → FieldExtractor → WordMatcher → ScanItem 四段串成一条管道，
 * 对外只暴露一个 generator，逐条产出 ScanItem（含本次扫描覆盖的字段和命中明细）。
 *
 * scanner 本身无状态：每次 scan() 接收一个 ScanPlan，四段在 plan 里组装。
 * 批量模式 = 消费侧收集全部 ScanItem；逐个模式 = 消费侧逐条 yield + 决策。
 * 处置（ResultAction）不在这里执行，由消费侧自行决定何时 apply。
 */
export function createComplianceScanner(): ComplianceScanner {
  return {
    async *scan(accountId, plan: ScanPlan, words: string[], signal: AbortSignal): AsyncGenerator<ScanItem> {
      const logger = createDiagnosticLogger({ domain: 'compliance', component: 'Scanner', accountId });
      logger.info(`开始合规扫描，词库共 ${words.length} 个词`);
      let scanned = 0;

      for await (const product of plan.source.stream(accountId, signal)) {
        if (signal.aborted) {
          logger.info(`用户手动停止，已扫描 ${scanned} 条`);
          return;
        }

        // 第二段：抽字段；第三段：词库 × 字段 → 命中
        const fields = plan.fields.extract(product);
        const matches = plan.matcher.match(fields, words);
        scanned++;

        // 只对命中的商品输出详细日志，减少噪音（与重构前行为一致）
        if (matches.length > 0) {
          const words = Array.from(new Set(matches.map(m => m.word))).join(', ');
          logger.info(`#${scanned} id=${product.productId} 命中违禁词: [${words}]`);
        }

        yield {
          productId: product.productId,
          title: product.title,
          scannedFields: fields,
          matches,
        };
      }

      logger.info(`扫描完成: 共扫描 ${scanned} 条`);
    },
  };
}
