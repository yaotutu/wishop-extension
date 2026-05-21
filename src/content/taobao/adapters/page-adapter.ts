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
  const normalized = text
    .replace(/,/g, '')
    .replace(/\s*([.．])\s*/g, '.');
  const match = normalized.match(/(?:¥|￥)?\s*(\d+(?:\.\d{1,2})?)/u);
  if (!match) return undefined;
  return Math.round(Number(match[1]) * 100);
}

function textOfVisibleElement(selector: string): string {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return '';
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') return '';
  return element.textContent?.trim() || '';
}

function extractPriceByLabel(text: string, labels: string[]): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  for (const label of labels) {
    const index = normalized.indexOf(label);
    if (index < 0) continue;
    const tail = normalized.slice(index + label.length);
    const match = tail.match(/(?:¥|￥)\s*\d+(?:\s*[.．]\s*\d{1,2})?|\d+(?:\s*[.．]\s*\d{1,2})?/u);
    if (match) return match[0].trim();
  }
  return '';
}

function readCheckoutPayAmount(): { text: string; cents?: number } {
  const submitText = textOfVisibleElement('#submitOrder')
    || textOfVisibleElement('[class*="trade-container-submitOrder"]')
    || textOfVisibleElement('[class*="trade-buy-btn-submit"]');
  const submitPrice = extractPriceByLabel(submitText, ['立即支付']);
  if (submitPrice) return { text: submitPrice, cents: parsePriceCents(submitPrice) };

  const totalText = textOfVisibleElement('[class*="cartSettlementTotalDiscount"]')
    || textOfVisibleElement('#settlementPanelContainer')
    || textOfVisibleElement('#settlementContainer');
  const totalPrice = extractPriceByLabel(totalText, ['合计', '实付款', '应付', '需付款']);
  const text = totalPrice || '';
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
