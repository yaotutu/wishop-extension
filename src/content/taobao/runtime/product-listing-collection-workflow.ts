import { extensionApi } from '../../../shared/extension-api.ts';
import type { ProductListingCollectionSession, TaobaoProductSnapshot } from '../../../shared/types.ts';
import {
  buildTaobaoProductSnapshotFromPageModel,
  detectTaobaoProductDetailPage,
  isTaobaoProductSnapshotUseful,
  readTaobaoProductSnapshotFromDocument,
} from '../adapters/product-detail-collection-adapter.ts';
import { detectTaobaoSecurityChallenge } from '../adapters/security-challenge-adapter.ts';
import { collectTaobaoProductFromPageWorld, type PageWorldProductPayload } from './page-world-product-collector.ts';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function mergeSnapshot(primary: TaobaoProductSnapshot, fallback: TaobaoProductSnapshot): TaobaoProductSnapshot {
  const usedDocumentFallback = primary.diagnostics.usedDocumentFallback
    || !primary.title
    || !primary.shop.name
    || primary.images.main.length === 0
    || primary.sku.matrix.length === 0;
  return {
    ...primary,
    title: primary.title || fallback.title,
    shop: { name: primary.shop.name || fallback.shop.name },
    category: { source: primary.category.source || fallback.category.source },
    seller: primary.seller.shopName ? primary.seller : fallback.seller,
    price: { rangeText: primary.price.rangeText || fallback.price.rangeText },
    images: {
      main: primary.images.main.length > 0 ? primary.images.main : fallback.images.main,
      detail: primary.images.detail.length > 0 ? primary.images.detail : fallback.images.detail,
      assets: shouldUseFallbackImageAssets(primary) ? mergeImageAssets(primary.images.assets, fallback.images.assets) : primary.images.assets,
    },
    detail: {
      text: primary.detail.text || fallback.detail.text,
      source: primary.detail.source !== 'none' ? primary.detail.source : fallback.detail.source,
      images: primary.detail.images.length > 0 ? primary.detail.images : fallback.detail.images,
    },
    params: primary.params.length > 0 ? primary.params : fallback.params,
    sku: {
      groups: primary.sku.groups.length > 0 ? primary.sku.groups : fallback.sku.groups,
      properties: primary.sku.properties.length > 0 ? primary.sku.properties : fallback.sku.properties,
      matrix: primary.sku.matrix.length > 0 ? primary.sku.matrix : fallback.sku.matrix,
    },
    sales: { text: primary.sales.text || fallback.sales.text },
    delivery: { text: primary.delivery.text || fallback.delivery.text },
    diagnostics: {
      ...primary.diagnostics,
      usedDocumentFallback,
      sources: {
        ...fallback.diagnostics.sources,
        ...primary.diagnostics.sources,
      },
      warnings: Array.from(new Set([...fallback.diagnostics.warnings, ...primary.diagnostics.warnings])),
    },
  };
}

function shouldUseFallbackImageAssets(snapshot: TaobaoProductSnapshot): boolean {
  return snapshot.images.assets.length === 0
    || snapshot.images.main.length === 0
    || snapshot.images.detail.length === 0;
}

function isTaobaoPlatformTpsImageUrl(url: string): boolean {
  return /!!600000\d+-\d+-tps-\d+-\d+/iu.test(url);
}

function shouldKeepMergedImageAsset(asset: TaobaoProductSnapshot['images']['assets'][number]): boolean {
  if (!asset.normalizedUrl) return false;
  /**
   * document fallback 可能扫到淘宝平台自己的说明图、角标和保障图。
   * 这些图片的 seller 段通常是 `!!600000...-tps-宽-高`，不是商家的商品素材。
   */
  if (isTaobaoPlatformTpsImageUrl(asset.normalizedUrl)) return false;
  if (asset.flags?.includes('platformPriceDescription')) return false;
  return true;
}

function mergeImageAssets(
  primary: TaobaoProductSnapshot['images']['assets'],
  fallback: TaobaoProductSnapshot['images']['assets'],
): TaobaoProductSnapshot['images']['assets'] {
  const seen = new Set<string>();
  const merged: TaobaoProductSnapshot['images']['assets'] = [];
  for (const asset of [...primary, ...fallback]) {
    if (!shouldKeepMergedImageAsset(asset) || seen.has(asset.normalizedUrl)) continue;
    seen.add(asset.normalizedUrl);
    merged.push(asset);
  }
  return merged;
}

async function collectSnapshot(): Promise<TaobaoProductSnapshot> {
  await delay(1200);
  const fallback = readTaobaoProductSnapshotFromDocument(document, location.href);
  return collectTaobaoProductSnapshotFromSources(fallback, () => collectTaobaoProductFromPageWorld());
}

export async function collectTaobaoProductSnapshotFromSources(
  fallback: TaobaoProductSnapshot,
  pageWorldCollector: () => Promise<PageWorldProductPayload>,
): Promise<TaobaoProductSnapshot> {
  let pageWorldPayload: PageWorldProductPayload;
  try {
    pageWorldPayload = await pageWorldCollector();
  } catch {
    return fallback;
  }
  if (!pageWorldPayload.pageModel) return fallback;
  const snapshot = buildTaobaoProductSnapshotFromPageModel({
    pageModel: pageWorldPayload.pageModel,
    url: fallback.identity.url,
    detailContent: pageWorldPayload.detailContent,
  });
  return mergeSnapshot(snapshot, fallback);
}

export async function runProductListingCollectionWorkflow(
  session: ProductListingCollectionSession,
): Promise<void> {
  try {
    await extensionApi.productListingCollection.markPageReady(session.id);
    const challenge = detectTaobaoSecurityChallenge();
    if (challenge.detected) {
      await extensionApi.productListingCollection.reportChallenge(session.id, challenge);
      return;
    }
    if (!detectTaobaoProductDetailPage(location.href)) {
      await extensionApi.productListingCollection.fail(session.id, '当前页面不是淘宝或天猫商品详情页');
      return;
    }
    const snapshot = await collectSnapshot();
    if (!isTaobaoProductSnapshotUseful(snapshot)) {
      await extensionApi.productListingCollection.fail(session.id, '没有读取到可用的淘宝商品数据');
      return;
    }
    await extensionApi.productListingCollection.complete(session.id, snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : '淘宝商品采集失败';
    await extensionApi.productListingCollection.fail(session.id, message).catch(() => {});
  }
}
