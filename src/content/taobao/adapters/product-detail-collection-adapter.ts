import type {
  TaobaoProductDetailContent,
  TaobaoProductImageAsset,
  TaobaoProductParam,
  TaobaoProductSellerSnapshot,
  TaobaoProductSourceCategorySnapshot,
  TaobaoProductSkuGroup,
  TaobaoProductSkuMatrixItem,
  TaobaoProductSkuProperty,
  TaobaoProductSkuSpec,
  TaobaoProductSnapshot,
} from '../../../shared/types';
import { normalizeText } from '../dom/text.ts';

const IMAGE_HOST_HINTS = ['alicdn.com', 'taobaocdn.com', 'tbcdn.cn'];
const SKU_LABELS = ['颜色', '颜色分类', '尺码', '规格', '套餐', '版本', '容量', '型号', '净含量'];
const PRIVATE_MODEL_KEY_PATTERN = /(address|phone|mobile|tel|receiver|recipient|passport|token|cookie|nick|buyer|user|encryptUid|deliveryTo|deliverTo|areaId|asac|mi_id|buyExParams|sign)/i;
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
const CATEGORY_ID_KEYS = [
  'categoryId',
  'catId',
  'cid',
  'leafCategoryId',
  'leafCatId',
  'itemCatId',
  'auctionCatId',
  'auctionCategoryId',
];

interface BuildTaobaoProductSnapshotInput {
  pageModel: unknown;
  url: string;
  detailImages?: string[];
  detailContent?: TaobaoProductDetailContent;
  collectedAt?: number;
}

function parseProductUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function normalizeProductPageUrl(url: string, itemId?: string): string {
  const current = parseProductUrl(url);
  if (!current) return url;
  const canonical = new URL(`${current.protocol}//${current.hostname}${current.pathname}`);
  const normalizedItemId = itemId?.trim() || current.searchParams.get('id')?.trim() || '';
  const skuId = current.searchParams.get('skuId')?.trim() || '';
  if (normalizedItemId) canonical.searchParams.set('id', normalizedItemId);
  if (skuId) canonical.searchParams.set('skuId', skuId);
  return canonical.toString();
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

function getArray(value: unknown, key: string): unknown[] {
  const nested = isRecord(value) ? value[key] : undefined;
  return Array.isArray(nested) ? nested : [];
}

function getString(value: unknown, key: string): string {
  const nested = isRecord(value) ? value[key] : undefined;
  return typeof nested === 'string' || typeof nested === 'number' ? String(nested).trim() : '';
}

function getNumber(value: unknown, key: string): number | undefined {
  const nested = isRecord(value) ? value[key] : undefined;
  if (typeof nested === 'number' && Number.isFinite(nested)) return nested;
  if (typeof nested === 'string' && nested.trim() && Number.isFinite(Number(nested))) return Number(nested);
  return undefined;
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

function uniqueImageAssets(values: TaobaoProductImageAsset[], limit: number): TaobaoProductImageAsset[] {
  const seen = new Set<string>();
  const assets: TaobaoProductImageAsset[] = [];
  for (const asset of values) {
    if (!asset.normalizedUrl || seen.has(asset.normalizedUrl)) continue;
    seen.add(asset.normalizedUrl);
    assets.push(asset);
    if (assets.length >= limit) break;
  }
  return assets;
}

function imageAsset(
  rawUrl: string,
  role: TaobaoProductImageAsset['role'],
  source: TaobaoProductImageAsset['source'],
  patch: Partial<TaobaoProductImageAsset> = {},
): TaobaoProductImageAsset | null {
  const normalizedUrl = normalizeImageUrl(rawUrl);
  if (!normalizedUrl) return null;
  return {
    url: rawUrl,
    normalizedUrl,
    role,
    source,
    flags: [],
    ...patch,
  };
}

function pickFirstString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = getString(record, key);
    if (value) return value;
  }
  return '';
}

function readSourceCategoryFromPageModel(pageModel: unknown): TaobaoProductSourceCategorySnapshot | undefined {
  const item = getRecord(pageModel, 'item');
  const plusViewVO = getRecord(pageModel, 'plusViewVO');
  const leftButtonStyleVO = getRecord(plusViewVO, 'leftButtonStyleVO');
  const logParams = getRecord(leftButtonStyleVO, 'logParams');
  const pcBuyParams = getRecord(getRecord(pageModel, 'pcTrade'), 'pcBuyParams');
  const components = getRecord(pageModel, 'componentsVO');
  const categoryVO = getRecord(components, 'categoryVO');
  /**
   * 淘宝 2025 详情页不稳定暴露中文类目，真实页面验证只稳定提供 catId/rootCatId。
   * 中文类目统一在后台用 taobao_itemcats 字典补全，避免把“进店”等页面文案误存为类目。
   */
  const id = pickFirstString(item, CATEGORY_ID_KEYS)
    || pickFirstString(categoryVO, CATEGORY_ID_KEYS)
    || getString(logParams, 'catId')
    || getString(pcBuyParams, 'rootCatId');
  return id ? { id: normalizeText(id) } : undefined;
}

function normalizeImageList(values: unknown[], limit: number): string[] {
  return uniqueStrings(values.map(value => typeof value === 'string' ? normalizeImageUrl(value) : ''), limit);
}

function normalizeDetailContent(input: BuildTaobaoProductSnapshotInput): TaobaoProductDetailContent {
  if (input.detailContent) {
    return {
      text: normalizeText(input.detailContent.text),
      source: input.detailContent.source,
      images: uniqueImageAssets(input.detailContent.images.map(asset => ({
        ...asset,
        normalizedUrl: normalizeImageUrl(asset.normalizedUrl || asset.url),
        url: asset.url || asset.normalizedUrl,
        role: asset.role || 'detail',
        source: asset.source || 'detailDom',
        flags: asset.flags || [],
      })), 120),
    };
  }
  const images = (input.detailImages || [])
    .map(url => imageAsset(url, 'detail', 'detailDom'))
    .filter((asset): asset is TaobaoProductImageAsset => Boolean(asset));
  return {
    text: '',
    source: images.length > 0 ? 'detailDom' : 'none',
    images,
  };
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

function readSourceCategoryFromDocument(root: ParentNode): TaobaoProductSourceCategorySnapshot | undefined {
  return undefined;
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

function readProductParamsFromPageModel(pageModel: unknown): TaobaoProductParam[] {
  const industryParam = getRecord(getRecord(pageModel, 'plusViewVO'), 'industryParamVO');
  const readParamGroup = (key: string, group: TaobaoProductParam['group']): TaobaoProductParam[] => getArray(industryParam, key)
    .map(item => {
      const name = getString(item, 'propertyName') || getString(item, 'name');
      const value = getString(item, 'valueName') || getString(item, 'value');
      return name && value ? { name, value, group } : null;
    })
    .filter((item): item is TaobaoProductParam => Boolean(item));
  return [
    ...readParamGroup('enhanceParamList', 'enhance'),
    ...readParamGroup('basicParamList', 'basic'),
  ];
}

function readSellerFromPageModel(pageModel: unknown): TaobaoProductSellerSnapshot {
  const seller = getRecord(pageModel, 'seller');
  return {
    shopName: getString(seller, 'shopName'),
    sellerId: getString(seller, 'sellerId'),
    shopId: getString(seller, 'shopId'),
  };
}

function readSkuGroupsFromPageModel(pageModel: unknown): TaobaoProductSkuGroup[] {
  const props = getArray(getRecord(pageModel, 'skuBase'), 'props');
  return props
    .map((prop): TaobaoProductSkuGroup | null => {
      const pid = getString(prop, 'pid');
      const name = getString(prop, 'name');
      const values = getArray(prop, 'values')
        .map(value => getString(value, 'name'))
        .filter(Boolean);
      return name && values.length > 0 ? { pid: pid || undefined, name, values } : null;
    })
    .filter((group): group is TaobaoProductSkuGroup => Boolean(group));
}

function readSkuPropertiesFromPageModel(pageModel: unknown): TaobaoProductSkuProperty[] {
  return getArray(getRecord(pageModel, 'skuBase'), 'props')
    .map((prop): TaobaoProductSkuProperty | null => {
      const pid = getString(prop, 'pid');
      const name = getString(prop, 'name');
      const values = getArray(prop, 'values')
        .map(value => {
          const valueName = getString(value, 'name');
          if (!valueName) return null;
          return {
            vid: getString(value, 'vid') || undefined,
            name: valueName,
            imageUrl: normalizeImageUrl(getString(value, 'image')) || undefined,
          };
        })
        .filter((value): value is NonNullable<typeof value> => Boolean(value));
      return name && values.length > 0 ? { pid: pid || undefined, name, values } : null;
    })
    .filter((property): property is TaobaoProductSkuProperty => Boolean(property));
}

function createSkuValueLookup(pageModel: unknown): Map<string, { spec: TaobaoProductSkuSpec; imageUrl: string }> {
  const lookup = new Map<string, { spec: TaobaoProductSkuSpec; imageUrl: string }>();
  for (const prop of getArray(getRecord(pageModel, 'skuBase'), 'props')) {
    const propId = getString(prop, 'pid');
    const propName = getString(prop, 'name');
    if (!propId || !propName) continue;
    for (const value of getArray(prop, 'values')) {
      const valueId = getString(value, 'vid');
      const valueName = getString(value, 'name');
      if (!valueId || !valueName) continue;
      lookup.set(`${propId}:${valueId}`, {
        spec: { pid: propId, vid: valueId, name: propName, value: valueName },
        imageUrl: normalizeImageUrl(getString(value, 'image')),
      });
    }
  }
  return lookup;
}

function readSkuMatrixFromPageModel(pageModel: unknown): TaobaoProductSkuMatrixItem[] {
  const skuBase = getRecord(pageModel, 'skuBase');
  const sku2info = getRecord(getRecord(pageModel, 'skuCore'), 'sku2info');
  const lookup = createSkuValueLookup(pageModel);
  return getArray(skuBase, 'skus')
    .map((sku): TaobaoProductSkuMatrixItem | null => {
      const skuId = getString(sku, 'skuId');
      const propPath = getString(sku, 'propPath');
      const skuInfo = getRecord(sku2info, skuId);
      const price = getRecord(skuInfo, 'price');
      const specs: TaobaoProductSkuSpec[] = [];
      const imageUrls: string[] = [];
      for (const pair of propPath.split(';').map(item => item.trim()).filter(Boolean)) {
        const matched = lookup.get(pair);
        if (!matched) continue;
        specs.push(matched.spec);
        if (matched.imageUrl) imageUrls.push(matched.imageUrl);
      }
      if (!skuId && specs.length === 0) return null;
      const quantity = getNumber(skuInfo, 'quantity');
      const quantityText = getString(skuInfo, 'quantityText');
      return {
        id: skuId || propPath || specs.map(spec => spec.value).join(' / '),
        skuId,
        propPath,
        specs,
        priceText: getString(price, 'priceText'),
        priceMoney: getNumber(price, 'priceMoney'),
        stockText: quantityText || (quantity === undefined ? '' : String(quantity)),
        quantity,
        imageUrl: imageUrls[0] || '',
        logisticsTime: getString(skuInfo, 'logisticsTime'),
      };
    })
    .filter((item): item is TaobaoProductSkuMatrixItem => Boolean(item));
}

function readPriceRangeFromPageModel(pageModel: unknown): string {
  const sku2info = getRecord(getRecord(pageModel, 'skuCore'), 'sku2info');
  const baseInfo = getRecord(sku2info, '0');
  const basePrice = getRecord(baseInfo, 'price');
  const priceText = getString(basePrice, 'priceText');
  const priceDesc = getString(basePrice, 'priceDesc');
  return priceText ? `${priceText}${priceDesc}` : '';
}

function readDetailTextFromPageModel(pageModel: unknown, group: 'sales' | 'delivery'): string {
  const components = getRecord(pageModel, 'componentsVO');
  if (group === 'sales') {
    return getString(getRecord(components, 'titleVO'), 'salesDesc');
  }
  return getString(getRecord(components, 'deliveryVO'), 'agingDesc');
}

function readMainImagesFromPageModel(pageModel: unknown): string[] {
  const item = getRecord(pageModel, 'item');
  const headImages = getArray(getRecord(getRecord(pageModel, 'componentsVO'), 'headImageVO'), 'images');
  const itemImages = getArray(item, 'images');
  return normalizeImageList([...itemImages, ...headImages], 20);
}

function readMainImageAssetsFromPageModel(pageModel: unknown): TaobaoProductImageAsset[] {
  return readMainImagesFromPageModel(pageModel)
    .map(url => imageAsset(url, 'main', 'pageModel'))
    .filter((asset): asset is TaobaoProductImageAsset => Boolean(asset));
}

function readSkuImageAssetsFromPageModel(pageModel: unknown): TaobaoProductImageAsset[] {
  return readSkuPropertiesFromPageModel(pageModel)
    .flatMap(property => property.values)
    .map(value => value.imageUrl ? imageAsset(value.imageUrl, 'sku', 'skuModel') : null)
    .filter((asset): asset is TaobaoProductImageAsset => Boolean(asset));
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
  const itemId = current?.searchParams.get('id')?.trim() || '';
  const { mainImages, detailImages } = readProductImages(root);
  const shopName = readShopName(root);
  const mainAssets = mainImages.map(image => imageAsset(image, 'fallback', 'documentDom')).filter((asset): asset is TaobaoProductImageAsset => Boolean(asset));
  const detailAssets = detailImages.map(image => imageAsset(image, 'fallback', 'documentDom')).filter((asset): asset is TaobaoProductImageAsset => Boolean(asset));
  return {
    identity: {
      url: normalizeProductPageUrl(url, itemId),
      platform: current?.hostname.includes('tmall.com') ? 'tmall' : 'taobao',
      itemId,
    },
    title: readProductTitle(root),
    shop: { name: shopName },
    category: { source: readSourceCategoryFromDocument(root) },
    seller: { shopName, sellerId: '', shopId: '' },
    price: { rangeText: readPriceRangeText(root) },
    images: {
      main: mainImages,
      detail: detailImages,
      assets: uniqueImageAssets([...mainAssets, ...detailAssets], 160),
    },
    detail: {
      text: '',
      source: detailImages.length > 0 ? 'documentDom' : 'none',
      images: detailImages,
    },
    params: [],
    sku: {
      groups: readSkuGroups(root),
      properties: [],
      matrix: readSkuMatrix(root),
    },
    sales: { text: readCompactTextAround(root, ['销量', '月销', '已售']) },
    delivery: { text: readCompactTextAround(root, ['发货', '配送', '运费']) },
    diagnostics: {
      usedPageModel: false,
      usedDocumentFallback: true,
      sources: {
        snapshot: 'documentDom',
        detail: detailImages.length > 0 ? 'documentDom' : 'none',
      },
      warnings: [],
    },
    collectedAt: Date.now(),
  };
}

export function readTaobaoProductSnapshot(): TaobaoProductSnapshot {
  return readTaobaoProductSnapshotFromDocument(document, location.href);
}

export function isTaobaoProductSnapshotUseful(snapshot: TaobaoProductSnapshot): boolean {
  return Boolean(snapshot.identity.itemId && (snapshot.title || snapshot.price.rangeText || snapshot.images.main.length > 0));
}

export function buildTaobaoProductSnapshotFromPageModel(input: BuildTaobaoProductSnapshotInput): TaobaoProductSnapshot {
  const current = parseProductUrl(input.url);
  const item = getRecord(input.pageModel, 'item');
  const itemId = getString(item, 'itemId') || current?.searchParams.get('id')?.trim() || '';
  const seller = readSellerFromPageModel(input.pageModel);
  const detailContent = normalizeDetailContent(input);
  const mainAssets = readMainImageAssetsFromPageModel(input.pageModel);
  const detailAssets = detailContent.images.map(asset => ({ ...asset, role: 'detail' as const }));
  const skuAssets = readSkuImageAssetsFromPageModel(input.pageModel);
  const mainImages = mainAssets.map(asset => asset.normalizedUrl);
  const detailImages = detailAssets.map(asset => asset.normalizedUrl);
  const hasPageModel = isRecord(input.pageModel) && Object.keys(input.pageModel).length > 0;
  return {
    identity: {
      url: normalizeProductPageUrl(input.url, itemId),
      platform: current?.hostname.includes('tmall.com') ? 'tmall' : 'taobao',
      itemId,
    },
    title: getString(item, 'title'),
    shop: { name: seller.shopName },
    category: { source: readSourceCategoryFromPageModel(input.pageModel) },
    seller,
    price: { rangeText: readPriceRangeFromPageModel(input.pageModel) },
    images: {
      main: uniqueStrings(mainImages, 20),
      detail: uniqueStrings(detailImages, 120),
      assets: uniqueImageAssets([...mainAssets, ...detailAssets, ...skuAssets], 180),
    },
    detail: {
      text: detailContent.text,
      source: detailContent.source,
      images: uniqueStrings(detailImages, 120),
    },
    params: readProductParamsFromPageModel(input.pageModel),
    sku: {
      groups: readSkuGroupsFromPageModel(input.pageModel),
      properties: readSkuPropertiesFromPageModel(input.pageModel),
      matrix: readSkuMatrixFromPageModel(input.pageModel),
    },
    sales: { text: readDetailTextFromPageModel(input.pageModel, 'sales') || getString(item, 'vagueSellCount') },
    delivery: { text: readDetailTextFromPageModel(input.pageModel, 'delivery') },
    rawModel: sanitizeTaobaoProductPageModel(input.pageModel),
    diagnostics: {
      usedPageModel: hasPageModel,
      usedDocumentFallback: false,
      sources: {
        snapshot: hasPageModel ? 'pageModel' : 'none',
        mainImages: mainAssets.length > 0 ? 'pageModel' : 'none',
        detail: detailContent.source,
        sku: readSkuMatrixFromPageModel(input.pageModel).length > 0 ? 'pageModel' : 'none',
      },
      warnings: [],
    },
    collectedAt: input.collectedAt || Date.now(),
  };
}

function sanitizeModelValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => sanitizeModelValue(item)).filter(item => item !== undefined);
  }
  if (!isRecord(value)) return value;

  const sanitized: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (PRIVATE_MODEL_KEY_PATTERN.test(key)) continue;
    const nextValue = sanitizeModelValue(nested);
    if (nextValue !== undefined) sanitized[key] = nextValue;
  }
  return sanitized;
}

export function sanitizeTaobaoProductPageModel(pageModel: unknown): unknown {
  if (!isRecord(pageModel)) return pageModel;
  const plusViewVO = getRecord(pageModel, 'plusViewVO');
  const leftButtonStyleVO = getRecord(plusViewVO, 'leftButtonStyleVO');
  const logParams = getRecord(leftButtonStyleVO, 'logParams');
  const pcBuyParams = getRecord(getRecord(pageModel, 'pcTrade'), 'pcBuyParams');
  const componentsVO = getRecord(pageModel, 'componentsVO');
  /**
   * rawModel 是诊断用的富快照，但它不能保存登录账号或下单会话数据。
   * 大对象在这里先做业务白名单抽取，再递归跑敏感 key 兜底过滤。
   */
  return sanitizeModelValue({
    seller: pageModel.seller,
    item: pageModel.item,
    plusViewVO: {
      industryParamVO: plusViewVO.industryParamVO,
      leftButtonStyleVO: {
        logParams: {
          catId: logParams.catId,
        },
      },
    },
    skuBase: pageModel.skuBase,
    pcTrade: {
      pcBuyParams: {
        rootCatId: pcBuyParams.rootCatId,
      },
    },
    skuCore: {
      sku2info: pickPublicSku2Info(getRecord(pageModel, 'skuCore').sku2info),
    },
    componentsVO: {
      headImageVO: componentsVO.headImageVO,
      titleVO: componentsVO.titleVO,
      deliveryVO: pickPublicKeys(componentsVO.deliveryVO, PUBLIC_DELIVERY_KEYS),
      priceVO: componentsVO.priceVO,
      extensionInfoVO: componentsVO.extensionInfoVO,
      categoryVO: componentsVO.categoryVO,
      breadcrumbVO: componentsVO.breadcrumbVO,
    },
  });
}
