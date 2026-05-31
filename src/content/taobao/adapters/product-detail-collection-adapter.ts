import type {
  TaobaoProductSkuGroup,
  TaobaoProductSkuMatrixItem,
  TaobaoProductSkuSpec,
  TaobaoProductSnapshot,
} from '../../../shared/types';
import { normalizeText } from '../dom/text';

const IMAGE_HOST_HINTS = ['alicdn.com', 'taobaocdn.com', 'tbcdn.cn'];
const SKU_LABELS = ['颜色', '颜色分类', '尺码', '规格', '套餐', '版本', '容量', '型号', '净含量'];

function parseProductUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function detectTaobaoProductDetailPage(url = location.href): boolean {
  const current = parseProductUrl(url);
  if (!current) return false;
  const hostname = current.hostname.toLowerCase();
  const isTaobao = hostname === 'item.taobao.com' && current.pathname.endsWith('/item.htm');
  const isTmall = (hostname === 'detail.tmall.com' || hostname.endsWith('.tmall.com')) && current.pathname.endsWith('/item.htm');
  return (isTaobao || isTmall) && Boolean(current.searchParams.get('id')?.trim());
}

function textOf(root: ParentNode, selector: string): string {
  return normalizeText(root.querySelector(selector)?.textContent || '');
}

function readMetaContent(root: ParentNode, property: string): string {
  return root.querySelector<HTMLMetaElement>(`meta[property="${property}"], meta[name="${property}"]`)?.content?.trim() || '';
}

function readProductTitle(root: ParentNode): string {
  return normalizeText(
    textOf(root, 'h1')
      || textOf(root, '[class*="ItemTitle"]')
      || textOf(root, '[class*="item-title"]')
      || readMetaContent(root, 'og:title'),
  );
}

function readShopName(root: ParentNode): string {
  return normalizeText(
    textOf(root, '[class*="shopName"]')
      || textOf(root, '[class*="ShopName"]')
      || textOf(root, '[class*="seller"]')
      || readMetaContent(root, 'og:site_name'),
  );
}

function readPriceRangeText(root: ParentNode): string {
  const candidates = [
    textOf(root, '[class*="Price--"]'),
    textOf(root, '[class*="price--"]'),
    textOf(root, '[class*="Price"]'),
    textOf(root, '[class*="price"]'),
    readMetaContent(root, 'product:price:amount'),
  ];
  for (const candidate of candidates) {
    const match = normalizeText(candidate).match(/(?:¥|￥)?\s*\d+(?:[.．]\d{1,2})?(?:\s*[-~]\s*(?:¥|￥)?\d+(?:[.．]\d{1,2})?)?/u);
    if (match) return match[0].replace(/\s+/g, '').trim();
  }
  return '';
}

function normalizeImageUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  const url = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed.replace(/^http:\/\//i, 'https://');
  return url.replace(/_\d+x\d+(?:q\d+)?\.(jpg|jpeg|png|webp).*$/i, '.$1');
}

function imageLooksLikeProduct(url: string): boolean {
  try {
    const parsed = new URL(url);
    return IMAGE_HOST_HINTS.some(host => parsed.hostname.includes(host));
  } catch {
    return false;
  }
}

function uniqueStrings(values: string[], limit: number): string[] {
  return Array.from(new Set(values.filter(Boolean))).slice(0, limit);
}

function readProductImages(root: ParentNode): { mainImages: string[]; detailImages: string[] } {
  const metaImages = [
    readMetaContent(root, 'og:image'),
    readMetaContent(root, 'twitter:image'),
  ].map(normalizeImageUrl);
  const allImages = Array.from(root.querySelectorAll('img'))
    .map(image => normalizeImageUrl(
      image.getAttribute('data-src')
        || image.getAttribute('data-ks-lazyload')
        || image.getAttribute('src')
        || '',
    ))
    .filter(imageLooksLikeProduct);
  const mainImages = uniqueStrings([...metaImages, ...allImages], 12);
  const detailImages = uniqueStrings(allImages.filter(url => !mainImages.includes(url)), 40);
  return { mainImages, detailImages };
}

function tokenizeSkuText(text: string): string[] {
  return normalizeText(text)
    .split(/[，,、/\s]+/u)
    .map(item => item.trim())
    .filter(Boolean);
}

function readSkuGroups(root: ParentNode): TaobaoProductSkuGroup[] {
  const skuText = Array.from(root.querySelectorAll('[class*="sku"], [class*="Sku"], [class*="SKU"]'))
    .map(node => normalizeText(node.textContent || ''))
    .join(' ');
  const tokens = tokenizeSkuText(skuText);
  const groups: TaobaoProductSkuGroup[] = [];
  for (const label of SKU_LABELS) {
    const labelIndex = tokens.indexOf(label);
    if (labelIndex < 0) continue;
    const nextLabelIndex = tokens.findIndex((token, index) => index > labelIndex && SKU_LABELS.includes(token));
    const end = nextLabelIndex > labelIndex ? nextLabelIndex : tokens.length;
    const values = uniqueStrings(tokens.slice(labelIndex + 1, end).filter(token => token.length <= 32), 32);
    if (values.length > 0) groups.push({ name: label, values });
  }
  return groups;
}

function parsePriceText(text: string): string {
  return text.match(/(?:¥|￥)\s*\d+(?:[.．]\d{1,2})?|\d+(?:[.．]\d{1,2})/u)?.[0]?.replace(/\s+/g, '') || '';
}

function parseStockText(text: string): string {
  return text.match(/(?:库存|余量|剩余)[：:\s]*(\d+)/u)?.[1] || '';
}

function parseSpecsFromText(text: string): TaobaoProductSkuSpec[] {
  const specs: TaobaoProductSkuSpec[] = [];
  for (const label of SKU_LABELS) {
    const match = text.match(new RegExp(`${label}[：:\\s]+([^\\s，,、/]+)`, 'u'));
    if (match?.[1]) specs.push({ name: label, value: match[1] });
  }
  return specs;
}

function readSkuMatrix(root: ParentNode): TaobaoProductSkuMatrixItem[] {
  const candidates = Array.from(root.querySelectorAll('[class*="sku"], [class*="Sku"], [class*="SKU"]'))
    .map(node => normalizeText(node.textContent || ''))
    .filter(text => SKU_LABELS.some(label => text.includes(label)) && (text.includes('价格') || text.includes('库存') || /(?:¥|￥)\s*\d/u.test(text)));
  return candidates.flatMap(readSkuMatrixFromText);
}

export function readSkuMatrixFromText(text: string): TaobaoProductSkuMatrixItem[] {
  return text
    .split(/\n|；|;/u)
    .map(line => normalizeText(line))
    .map(line => {
      const specs = parseSpecsFromText(line);
      if (specs.length === 0) return null;
      return {
        id: specs.map(spec => spec.value).join(' / '),
        specs,
        priceText: parsePriceText(line),
        stockText: parseStockText(line),
        imageUrl: '',
      };
    })
    .filter((item): item is TaobaoProductSkuMatrixItem => Boolean(item));
}

function readCompactTextAround(root: ParentNode, labels: string[]): string {
  const text = normalizeText(root.textContent || '');
  for (const label of labels) {
    const index = text.indexOf(label);
    if (index >= 0) return text.slice(index, index + 80).trim();
  }
  return '';
}

export function readTaobaoProductSnapshotFromDocument(root: Document, url: string): TaobaoProductSnapshot {
  const current = parseProductUrl(url);
  const { mainImages, detailImages } = readProductImages(root);
  return {
    url,
    platform: current?.hostname.includes('tmall.com') ? 'tmall' : 'taobao',
    itemId: current?.searchParams.get('id')?.trim() || '',
    title: readProductTitle(root),
    shopName: readShopName(root),
    priceRangeText: readPriceRangeText(root),
    mainImages,
    detailImages,
    skuGroups: readSkuGroups(root),
    skuMatrix: readSkuMatrix(root),
    salesText: readCompactTextAround(root, ['销量', '月销', '已售']),
    deliveryText: readCompactTextAround(root, ['发货', '配送', '运费']),
    collectedAt: Date.now(),
  };
}

export function readTaobaoProductSnapshot(): TaobaoProductSnapshot {
  return readTaobaoProductSnapshotFromDocument(document, location.href);
}

export function isTaobaoProductSnapshotUseful(snapshot: TaobaoProductSnapshot): boolean {
  return Boolean(snapshot.itemId && (snapshot.title || snapshot.priceRangeText || snapshot.mainImages.length > 0));
}
