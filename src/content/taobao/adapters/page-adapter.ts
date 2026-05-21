import { textOf } from '../dom/text';

export interface TaobaoPageSnapshot {
  title: string;
  url: string;
  priceText: string;
  selectedSkuText: string;
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
    title,
    url: location.href,
    priceText,
    selectedSkuText,
  };
}
