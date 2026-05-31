import {
  TAOBAO_PRODUCT_COLLECTION_REQUEST_EVENT,
  TAOBAO_PRODUCT_COLLECTION_RESPONSE_EVENT,
} from '../src/content/taobao/runtime/page-world-product-collector';

const PRIVATE_KEY_PATTERN = /(address|phone|mobile|tel|receiver|recipient|passport|token|cookie|nick|buyer|user)/i;

function normalizeImageUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  const url = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed.replace(/^http:\/\//i, 'https://');
  return url
    .replace(/~(?:crop|tplv|resize|q\d+|webp)[^?#]*/i, '')
    .replace(/_(?:\d+x\d+(?:q\d+)?|sum|webp)\.(jpg|jpeg|png|webp)(?=$|[?#])/i, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeModelValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => sanitizeModelValue(item)).filter(item => item !== undefined);
  }
  if (!isRecord(value)) return value;

  const sanitized: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (PRIVATE_KEY_PATTERN.test(key)) continue;
    const nextValue = sanitizeModelValue(nested);
    if (nextValue !== undefined) sanitized[key] = nextValue;
  }
  return sanitized;
}

function readProductPageModel(): unknown {
  const iceContext = (window as unknown as {
    __ICE_APP_CONTEXT__?: {
      loaderData?: {
        home?: {
          data?: {
            res?: Record<string, unknown>;
          };
        };
      };
    };
  }).__ICE_APP_CONTEXT__;
  const res = iceContext?.loaderData?.home?.data?.res;
  if (!res || !isRecord(res)) return null;

  const plusViewVO = isRecord(res.plusViewVO) ? res.plusViewVO : {};
  const skuCore = isRecord(res.skuCore) ? res.skuCore : {};
  const componentsVO = isRecord(res.componentsVO) ? res.componentsVO : {};
  return sanitizeModelValue({
    seller: res.seller,
    item: res.item,
    plusViewVO: { industryParamVO: plusViewVO.industryParamVO },
    skuBase: res.skuBase,
    skuCore: { sku2info: skuCore.sku2info },
    componentsVO: {
      headImageVO: componentsVO.headImageVO,
      titleVO: componentsVO.titleVO,
      deliveryVO: componentsVO.deliveryVO,
      priceVO: componentsVO.priceVO,
    },
  });
}

function readDetailImages(): string[] {
  const urls = Array.from(document.querySelectorAll('img'))
    .map(image => normalizeImageUrl(
      image.getAttribute('data-src')
        || image.getAttribute('data-ks-lazyload')
        || image.getAttribute('src')
        || '',
    ))
    .filter(url => /alicdn\.com|taobaocdn\.com|tbcdn\.cn/i.test(url));
  return Array.from(new Set(urls)).slice(0, 80);
}

export default defineContentScript({
  matches: ['https://*.taobao.com/*', 'https://*.tmall.com/*'],
  allFrames: false,
  runAt: 'document_idle',
  world: 'MAIN',

  main() {
    window.addEventListener(TAOBAO_PRODUCT_COLLECTION_REQUEST_EVENT, () => {
      window.postMessage({
        source: TAOBAO_PRODUCT_COLLECTION_RESPONSE_EVENT,
        payload: {
          pageModel: readProductPageModel(),
          detailImages: readDetailImages(),
        },
      }, '*');
    });
  },
});
