import type { TaobaoProductDetailContent } from '../../../shared/types.ts';

export interface PageWorldProductPayload {
  pageModel: unknown;
  detailContent: TaobaoProductDetailContent;
  resourceHints?: string[];
}

export const TAOBAO_PRODUCT_COLLECTION_REQUEST_EVENT = 'dianxiaoqi:collect-taobao-product';
export const TAOBAO_PRODUCT_COLLECTION_RESPONSE_EVENT = 'dianxiaoqi:taobao-product-collected';

export function collectTaobaoProductFromPageWorld(timeoutMs = 3000): Promise<PageWorldProductPayload> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('读取淘宝商品页面模型超时'));
    }, timeoutMs);

    function cleanup(): void {
      window.clearTimeout(timeoutId);
      window.removeEventListener('message', onMessage);
    }

    function onMessage(event: MessageEvent): void {
      if (event.source !== window || event.data?.source !== TAOBAO_PRODUCT_COLLECTION_RESPONSE_EVENT) return;
      cleanup();
      resolve(event.data.payload as PageWorldProductPayload);
    }

    window.addEventListener('message', onMessage);
    window.dispatchEvent(new Event(TAOBAO_PRODUCT_COLLECTION_REQUEST_EVENT));
  });
}
