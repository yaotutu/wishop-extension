import {
  TAOBAO_PRODUCT_COLLECTION_REQUEST_EVENT,
  TAOBAO_PRODUCT_COLLECTION_RESPONSE_EVENT,
} from '../src/content/taobao/runtime/page-world-product-collector';
import { waitForStableDetailImages } from '../src/content/taobao/runtime/detail-image-stability';
import type { TaobaoProductDetailContent, TaobaoProductImageAsset } from '../src/shared/types';

const PRIVATE_KEY_PATTERN = /(address|phone|mobile|tel|receiver|recipient|passport|token|cookie|nick|buyer|user|encryptUid|deliveryTo|deliverTo|areaId|asac|mi_id|buyExParams|sign)/i;
const PUBLIC_SKU_INFO_KEYS = ['price', 'subPrice', 'quantity', 'quantityText', 'logisticsTime'];
const PUBLIC_DELIVERY_KEYS = [
  'agingDesc',
  'deliveryDesc',
  'deliveryFromAddr',
  'deliveryFrom',
  'freight',
  'freightText',
  'postFee',
  'shippingFee',
  'logisticsTime',
];

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

function getRecord(value: unknown, key: string): Record<string, unknown> {
  const nested = isRecord(value) ? value[key] : undefined;
  return isRecord(nested) ? nested : {};
}

function pickPublicKeys(value: unknown, keys: string[]): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (value[key] !== undefined) picked[key] = value[key];
  }
  return Object.keys(picked).length > 0 ? picked : undefined;
}

function pickPublicSku2Info(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const picked: Record<string, unknown> = {};
  for (const [skuKey, skuInfo] of Object.entries(value)) {
    const publicSkuInfo = pickPublicKeys(skuInfo, PUBLIC_SKU_INFO_KEYS);
    if (publicSkuInfo) picked[skuKey] = publicSkuInfo;
  }
  return Object.keys(picked).length > 0 ? picked : undefined;
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

  const plusViewVO = getRecord(res, 'plusViewVO');
  const skuCore = getRecord(res, 'skuCore');
  const componentsVO = getRecord(res, 'componentsVO');
  const leftButtonStyleVO = getRecord(plusViewVO, 'leftButtonStyleVO');
  const logParams = getRecord(leftButtonStyleVO, 'logParams');
  const pcBuyParams = getRecord(getRecord(res, 'pcTrade'), 'pcBuyParams');
  return sanitizeModelValue({
    seller: res.seller,
    item: res.item,
    plusViewVO: {
      industryParamVO: plusViewVO.industryParamVO,
      leftButtonStyleVO: {
        logParams: {
          catId: logParams.catId,
        },
      },
    },
    skuBase: res.skuBase,
    /**
     * sku2info 的原始节点混有价格库存和下单风控参数。这里只保留
     * 上货需要的公开商品事实，避免持久化 asac、mi_id、buyExParams 等会话字段。
     */
    skuCore: { sku2info: pickPublicSku2Info(skuCore.sku2info) },
    pcTrade: {
      pcBuyParams: {
        rootCatId: pcBuyParams.rootCatId,
      },
    },
    componentsVO: {
      headImageVO: componentsVO.headImageVO,
      titleVO: componentsVO.titleVO,
      /**
       * deliveryVO 同时包含“发货地/时效”和当前登录账号的配送目的地。
       * 只采集发货地、运费、时效这类商品事实，不采集收货地址相关字段。
       */
      deliveryVO: pickPublicKeys(componentsVO.deliveryVO, PUBLIC_DELIVERY_KEYS),
      priceVO: componentsVO.priceVO,
      extensionInfoVO: componentsVO.extensionInfoVO,
      categoryVO: componentsVO.categoryVO,
      breadcrumbVO: componentsVO.breadcrumbVO,
    },
  });
}

function uniqueByNormalizedUrl(assets: TaobaoProductImageAsset[], limit: number): TaobaoProductImageAsset[] {
  const seen = new Set<string>();
  const unique: TaobaoProductImageAsset[] = [];
  for (const asset of assets) {
    if (!asset.normalizedUrl || seen.has(asset.normalizedUrl)) continue;
    seen.add(asset.normalizedUrl);
    unique.push(asset);
    if (unique.length >= limit) break;
  }
  return unique;
}

function selectorForRoot(root: ParentNode): string {
  if (root instanceof Element) {
    if (root.id) return `#${root.id}`;
    const className = String(root.className || '').split(/\s+/u).filter(Boolean)[0];
    if (className) return `.${className}`;
    return root.tagName.toLowerCase();
  }
  return 'document';
}

function detailImageAsset(image: HTMLImageElement, sourceSelector: string): TaobaoProductImageAsset | null {
  const lazyAttrs: Record<string, string> = {};
  for (const name of ['data-src', 'data-ks-lazyload', 'data-original', 'data-lazy-src', 'src']) {
    const value = image.getAttribute(name)?.trim();
    if (value) lazyAttrs[name] = value;
  }
  const rawUrl = lazyAttrs['data-src']
    || lazyAttrs['data-ks-lazyload']
    || lazyAttrs['data-original']
    || lazyAttrs['data-lazy-src']
    || lazyAttrs.src
    || '';
  const normalizedUrl = normalizeImageUrl(rawUrl);
  if (!normalizedUrl || !/alicdn\.com|taobaocdn\.com|tbcdn\.cn/i.test(normalizedUrl)) return null;
  const flags: string[] = [];
  if (/g\.alicdn\.com\/s\.gif/i.test(lazyAttrs.src || '')) flags.push('placeholderSrc');
  if (/6000000002284-2-tps/i.test(normalizedUrl)) flags.push('platformPriceDescription');
  if (image.naturalWidth <= 1 && image.naturalHeight <= 1) flags.push('notLoadedYet');
  return {
    url: rawUrl,
    normalizedUrl,
    role: 'detail',
    source: 'detailDom',
    sourceSelector,
    width: image.width || undefined,
    height: image.height || undefined,
    naturalWidth: image.naturalWidth || undefined,
    naturalHeight: image.naturalHeight || undefined,
    lazyAttrs,
    flags,
  };
}

function readImageAssetsFrom(root: ParentNode): TaobaoProductImageAsset[] {
  const sourceSelector = selectorForRoot(root);
  return Array.from(root.querySelectorAll('img'))
    .map(image => detailImageAsset(image, sourceSelector))
    .filter((asset): asset is TaobaoProductImageAsset => Boolean(asset));
}

function readRenderedDetailImageAssets(): TaobaoProductImageAsset[] {
  const detailRoots = Array.from(document.querySelectorAll('#imageTextInfo-content .descV8-container, #imageTextInfo-content, .desc-root'));
  const detailImages = uniqueByNormalizedUrl(detailRoots.flatMap(root => readImageAssetsFrom(root)), 120);
  if (detailImages.length > 0) return detailImages;
  return uniqueByNormalizedUrl(readImageAssetsFrom(document), 80)
    .map(asset => ({ ...asset, role: 'fallback', source: 'fallback', sourceSelector: 'document' }));
}

async function readDetailImageAssets(): Promise<TaobaoProductImageAsset[]> {
  /**
   * 淘宝图文详情由 desc-v8/getdesc 异步渲染，商品页首次进入时
   * document_idle 仍可能只看到部分详情图。这里等待图片列表连续稳定，
   * 避免把“第一张已经出现”误判成“详情图已全部渲染”。
   */
  return waitForStableDetailImages(
    readRenderedDetailImageAssets,
    ms => new Promise(resolve => window.setTimeout(resolve, ms)),
    undefined,
    asset => asset.normalizedUrl,
  );
}

function readDetailText(): string {
  const root = document.querySelector('#imageTextInfo-content');
  return (root?.textContent || '').replace(/\s+/g, ' ').trim();
}

async function readDetailContent(): Promise<TaobaoProductDetailContent> {
  const images = await readDetailImageAssets();
  return {
    text: readDetailText(),
    source: images.length > 0 ? 'detailDom' : 'none',
    images,
  };
}

function readResourceHints(): string[] {
  return performance.getEntriesByType('resource')
    .map(entry => entry.name)
    .filter(name => /mtop\.taobao\.detail\.getdesc|detail-project\/desc|desc-v8-render/i.test(name))
    .map(name => {
      try {
        const url = new URL(name);
        const api = url.searchParams.get('api');
        return api || `${url.hostname}${url.pathname}`;
      } catch {
        return name.split('?')[0];
      }
    })
    .filter(Boolean)
    .slice(0, 20);
}

export default defineContentScript({
  matches: ['https://*.taobao.com/*', 'https://*.tmall.com/*'],
  allFrames: false,
  runAt: 'document_idle',
  world: 'MAIN',

  main() {
    window.addEventListener(TAOBAO_PRODUCT_COLLECTION_REQUEST_EVENT, async () => {
      window.postMessage({
        source: TAOBAO_PRODUCT_COLLECTION_RESPONSE_EVENT,
        payload: {
          pageModel: readProductPageModel(),
          detailContent: await readDetailContent(),
          resourceHints: readResourceHints(),
        },
      }, '*');
    });
  },
});
