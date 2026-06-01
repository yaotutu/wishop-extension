import type {
  TaobaoProductParam,
  TaobaoProductSellerSnapshot,
  TaobaoProductSourceCategorySnapshot,
  TaobaoProductSkuGroup,
  TaobaoProductSkuMatrixItem,
  TaobaoProductSkuSpec,
  TaobaoProductSnapshot,
} from '../../../shared/types';
import { normalizeText } from '../dom/text.ts';

const IMAGE_HOST_HINTS = ['alicdn.com', 'taobaocdn.com', 'tbcdn.cn'];
const SKU_LABELS = ['颜色', '颜色分类', '尺码', '规格', '套餐', '版本', '容量', '型号', '净含量'];
const PRIVATE_MODEL_KEY_PATTERN = /(address|phone|mobile|tel|receiver|recipient|passport|token|cookie|nick|buyer|user)/i;

interface BuildTaobaoProductSnapshotInput {
  pageModel: unknown;
  url: string;
  detailImages?: string[];
  collectedAt?: number;
}

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

function normalizeCategoryPath(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value.map(item => {
      if (typeof item === 'string' || typeof item === 'number') return normalizeText(String(item));
      if (!isRecord(item)) return '';
      return normalizeText(
        getString(item, 'name')
          || getString(item, 'title')
          || getString(item, 'label')
          || getString(item, 'catName')
          || getString(item, 'categoryName'),
      );
    }), 8);
  }
  if (typeof value === 'string') {
    return uniqueStrings(
      normalizeText(value)
        .split(/[>/｜|/]+/u)
        .map(item => item.trim())
        .filter(Boolean),
      8,
    );
  }
  return [];
}

function pickFirstString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = getString(record, key);
    if (value) return value;
  }
  return '';
}

function pickFirstCategoryPath(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = normalizeCategoryPath(record[key]);
    if (value.length > 0) return value;
  }
  return [];
}

function firstNonEmptyCategoryPath(...values: string[][]): string[] {
  return values.find(value => value.length > 0) || [];
}

function normalizeSourceCategory(input: TaobaoProductSourceCategorySnapshot): TaobaoProductSourceCategorySnapshot | undefined {
  const path = uniqueStrings(input.path || [], 8);
  const name = normalizeText(input.name || '') || path[path.length - 1] || '';
  const id = normalizeText(input.id || '');
  if (!id && !name && path.length === 0) return undefined;
  return {
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
    ...(path.length > 0 ? { path } : {}),
  };
}

function readSourceCategoryFromPageModel(pageModel: unknown): TaobaoProductSourceCategorySnapshot | undefined {
  const item = getRecord(pageModel, 'item');
  const components = getRecord(pageModel, 'componentsVO');
  const categoryVO = getRecord(components, 'categoryVO');
  const breadcrumbVO = getRecord(components, 'breadcrumbVO');
  const path = firstNonEmptyCategoryPath(
    pickFirstCategoryPath(item, ['categoryPath', 'catPath', 'breadcrumb', 'breadcrumbs']),
    pickFirstCategoryPath(categoryVO, ['categoryPath', 'catPath', 'breadcrumb', 'breadcrumbs', 'path']),
    pickFirstCategoryPath(breadcrumbVO, ['categoryPath', 'catPath', 'breadcrumb', 'breadcrumbs', 'path']),
  );
  return normalizeSourceCategory({
    id: pickFirstString(item, ['categoryId', 'catId', 'cid', 'leafCategoryId'])
      || pickFirstString(categoryVO, ['categoryId', 'catId', 'cid', 'leafCategoryId']),
    name: pickFirstString(item, ['categoryName', 'catName', 'leafCategoryName'])
      || pickFirstString(categoryVO, ['categoryName', 'catName', 'leafCategoryName', 'name']),
    path,
  });
}

function normalizeImageList(values: unknown[], limit: number): string[] {
  return uniqueStrings(values.map(value => typeof value === 'string' ? normalizeImageUrl(value) : ''), limit);
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
  const metaCategory = readMetaContent(root, 'product:category') || readMetaContent(root, 'category');
  const metaPath = normalizeCategoryPath(metaCategory);
  if (metaPath.length > 0) {
    return normalizeSourceCategory({
      name: metaPath[metaPath.length - 1],
      path: metaPath,
    });
  }

  const ignoredLabels = new Set(['首页', '店铺', '淘宝', '天猫', '全部分类', '商品分类']);
  const linkPath = uniqueStrings(Array.from(root.querySelectorAll('a[href*="cat"], a[href*="category"]'))
    .map(link => normalizeText(link.textContent || ''))
    .filter(text => text.length >= 2 && text.length <= 30 && !ignoredLabels.has(text)), 8);
  return normalizeSourceCategory({
    name: linkPath[linkPath.length - 1],
    path: linkPath,
  });
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
    .map(prop => {
      const name = getString(prop, 'name');
      const values = getArray(prop, 'values')
        .map(value => getString(value, 'name'))
        .filter(Boolean);
      return name && values.length > 0 ? { name, values } : null;
    })
    .filter((group): group is TaobaoProductSkuGroup => Boolean(group));
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
        spec: { name: propName, value: valueName },
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
  const shopName = readShopName(root);
  return {
    url,
    platform: current?.hostname.includes('tmall.com') ? 'tmall' : 'taobao',
    itemId: current?.searchParams.get('id')?.trim() || '',
    title: readProductTitle(root),
    shopName,
    sourceCategory: readSourceCategoryFromDocument(root),
    seller: { shopName, sellerId: '', shopId: '' },
    priceRangeText: readPriceRangeText(root),
    mainImages,
    detailImages,
    productParams: [],
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

export function buildTaobaoProductSnapshotFromPageModel(input: BuildTaobaoProductSnapshotInput): TaobaoProductSnapshot {
  const current = parseProductUrl(input.url);
  const item = getRecord(input.pageModel, 'item');
  const seller = readSellerFromPageModel(input.pageModel);
  return {
    url: input.url,
    platform: current?.hostname.includes('tmall.com') ? 'tmall' : 'taobao',
    itemId: getString(item, 'itemId') || current?.searchParams.get('id')?.trim() || '',
    title: getString(item, 'title'),
    shopName: seller.shopName,
    sourceCategory: readSourceCategoryFromPageModel(input.pageModel),
    seller,
    priceRangeText: readPriceRangeFromPageModel(input.pageModel),
    mainImages: readMainImagesFromPageModel(input.pageModel),
    detailImages: normalizeImageList(input.detailImages || [], 80),
    productParams: readProductParamsFromPageModel(input.pageModel),
    skuGroups: readSkuGroupsFromPageModel(input.pageModel),
    skuMatrix: readSkuMatrixFromPageModel(input.pageModel),
    salesText: readDetailTextFromPageModel(input.pageModel, 'sales') || getString(item, 'vagueSellCount'),
    deliveryText: readDetailTextFromPageModel(input.pageModel, 'delivery'),
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
  return sanitizeModelValue({
    seller: pageModel.seller,
    item: pageModel.item,
    plusViewVO: isRecord(pageModel.plusViewVO) ? {
      industryParamVO: pageModel.plusViewVO.industryParamVO,
    } : undefined,
    skuBase: pageModel.skuBase,
    skuCore: isRecord(pageModel.skuCore) ? {
      sku2info: pageModel.skuCore.sku2info,
    } : undefined,
    componentsVO: isRecord(pageModel.componentsVO) ? {
      headImageVO: pageModel.componentsVO.headImageVO,
      titleVO: pageModel.componentsVO.titleVO,
      deliveryVO: pageModel.componentsVO.deliveryVO,
      priceVO: pageModel.componentsVO.priceVO,
      categoryVO: pageModel.componentsVO.categoryVO,
      breadcrumbVO: pageModel.componentsVO.breadcrumbVO,
    } : undefined,
  });
}
