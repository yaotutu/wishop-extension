import { textOf } from '../dom/text';

export interface TaobaoPageSnapshot {
  pageType: 'product-detail' | 'checkout' | 'order-detail' | 'unknown';
  title: string;
  url: string;
  priceText: string;
  selectedSkuText: string;
  checkoutPayAmountText: string;
  checkoutPayAmountCents?: number;
}

export function detectTaobaoPageType(url = location.href): TaobaoPageSnapshot['pageType'] {
  const current = new URL(url);
  if (current.hostname === 'item.taobao.com' && current.pathname.endsWith('/item.htm')) return 'product-detail';
  if (current.hostname === 'buy.taobao.com' && current.pathname.endsWith('/auction/buy_now.jhtml')) return 'checkout';
  if (current.hostname === 'trade.taobao.com' && current.pathname.includes('/trade/detail/')) return 'order-detail';
  return 'unknown';
}

function parsePriceCents(text: string): number | undefined {
  const match = text.replace(/,/g, '').match(/(?:¥|￥)?\s*(\d+(?:\.\d{1,2})?)/u);
  if (!match) return undefined;
  return Math.round(Number(match[1]) * 100);
}

function readCheckoutPayAmount(): { text: string; cents?: number } {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('span, strong, em, div, p'))
    .map(element => ({
      text: element.textContent?.trim() || '',
      rect: element.getBoundingClientRect(),
    }))
    .filter(item => item.text && item.rect.width > 0 && item.rect.height > 0)
    .filter(item => /实付款|应付|合计|订单总价|实付|需付款/u.test(item.text))
    .map(item => item.text)
    .filter(text => /(?:¥|￥)?\s*\d+(?:\.\d{1,2})?/u.test(text));

  const preferred = candidates.find(text => /实付款|应付|需付款/u.test(text)) || candidates[0] || '';
  const priceMatch = preferred.match(/(?:¥|￥)?\s*\d+(?:\.\d{1,2})?/u)?.[0]?.trim() || '';
  const text = priceMatch || preferred;
  return { text, cents: text ? parsePriceCents(text) : undefined };
}

/**
 * Taobao/Tmall page markup changes frequently, so selectors live behind this
 * adapter instead of inside the toolbar component. Future automation should
 * add methods here first, then keep the UI working against this stable shape.
 */
export function readTaobaoPageSnapshot(): TaobaoPageSnapshot {
  const pageType = detectTaobaoPageType();
  const title = textOf('h1') || textOf('[class*="title"]') || document.title;
  const priceText = textOf('[class*="price"]') || textOf('[class*="Price"]');
  const selectedSkuText = Array.from(document.querySelectorAll('[class*="sku"], [class*="Sku"]'))
    .map(node => node.textContent?.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' / ');
  const checkoutPayAmount = pageType === 'checkout'
    ? readCheckoutPayAmount()
    : { text: '', cents: undefined };

  return {
    pageType,
    title,
    url: location.href,
    priceText,
    selectedSkuText,
    checkoutPayAmountText: checkoutPayAmount.text,
    checkoutPayAmountCents: checkoutPayAmount.cents,
  };
}
