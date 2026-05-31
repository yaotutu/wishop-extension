import { WxShopClient, DraftProduct } from '../wxshop/client';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';

export async function* streamDraftProducts(api: WxShopClient, signal?: AbortSignal, accountId: string = ''): AsyncGenerator<DraftProduct> {
  const logger = createDiagnosticLogger({ domain: 'listing', component: 'StreamDrafts', accountId });
  let nextKey = '';
  let hasMore = true;

  while (hasMore) {
    if (signal?.aborted) return;
    const listResult = await api.getDraftProducts(30, nextKey);

    for (const productId of listResult.productIds) {
      if (signal?.aborted) return;
      try {
        const detail = await api.getProductDetail(productId);
        yield detail;
      } catch (error) {
        logger.error(`获取商品 ${productId} 详情失败:`, error);
      }
    }

    nextKey = listResult.nextKey;
    hasMore = listResult.hasMore && !!nextKey;
  }
}
