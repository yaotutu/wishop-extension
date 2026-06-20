import type { ScannableProduct, ScanSource } from '../types';
import { getListingClient } from '../../wxshop/client-registry';
import { createDiagnosticLogger } from '../../logging/diagnostic-logger.ts';

/**
 * 草稿箱数据源（默认实现）。
 *
 * 流式拉取微信小店草稿箱商品（status=0），逐个调 getProductDetailFull
 * 拿到带全量可扫描字段（标题/描述/属性/SKU 属性）的商品，聚合成 ScannableProduct。
 *
 * 注意：不复用 modules/fetch-draft-products.ts 的 streamDraftProducts，
 * 因为后者只调精简版 getProductDetail（不带描述等字段），无法满足多字段扫描。
 * 草稿列表分页逻辑与 streamDraftProducts 保持一致（page_size=30，按 next_key 翻页）。
 */
export class DraftBoxScanSource implements ScanSource {
  readonly key = 'draft';

  async *stream(accountId: string, signal: AbortSignal): AsyncGenerator<ScannableProduct> {
    const logger = createDiagnosticLogger({ domain: 'compliance', component: 'DraftBoxSource', accountId });
    const api = await getListingClient(accountId);
    let nextKey = '';
    let hasMore = true;

    while (hasMore) {
      if (signal.aborted) return;
      const listResult = await api.getDraftProducts(30, nextKey);

      for (const productId of listResult.productIds) {
        if (signal.aborted) return;
        try {
          const detail = await api.getProductDetailFull(productId);
          yield {
            productId: detail.productId,
            title: detail.title,
            desc: detail.desc,
            attrsText: detail.attrsText,
            skuAttrsText: detail.skuAttrsText,
            source: 'draft',
          };
        } catch (error) {
          logger.error(`获取商品 ${productId} 详情失败:`, error);
        }
      }

      nextKey = listResult.nextKey;
      hasMore = listResult.hasMore && !!nextKey;
    }
  }
}
