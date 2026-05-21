import { textOf } from '../dom/text';

export interface TaobaoPageSnapshot {
  pageType: 'product-detail' | 'checkout' | 'order-detail' | 'unknown';
  title: string;
  url: string;
  priceText: string;
  selectedSkuText: string;
}

export function detectTaobaoPageType(url = location.href): TaobaoPageSnapshot['pageType'] {
  const current = new URL(url);
  if (current.hostname === 'item.taobao.com' && current.pathname.endsWith('/item.htm')) return 'product-detail';
  if (current.hostname === 'buy.taobao.com' && current.pathname.endsWith('/auction/buy_now.jhtml')) return 'checkout';
  if (current.hostname === 'trade.taobao.com' && current.pathname.includes('/trade/detail/')) return 'order-detail';
  return 'unknown';
}

/**
 * Taobao/Tmall page markup changes frequently, so selectors live behind this
 * adapter instead of inside the toolbar component. Future automation should
 * add methods here first, then keep the UI working against this stable shape.
 */
export function readTaobaoPageSnapshot(): TaobaoPageSnapshot {
  const title = textOf('h1') || textOf('[class*="title"]') || document.title;
  const priceText = textOf('[class*="price"]') || textOf('[class*="Price"]');
  const selectedSkuText = Array.from(document.querySelectorAll('[class*="sku"], [class*="Sku"]'))
    .map(node => node.textContent?.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' / ');

  return {
    pageType: detectTaobaoPageType(),
    title,
    url: location.href,
    priceText,
    selectedSkuText,
  };
}
