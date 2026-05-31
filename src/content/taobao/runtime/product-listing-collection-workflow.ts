import { extensionApi } from '../../../shared/extension-api.ts';
import type { ProductListingCollectionSession, TaobaoProductSnapshot } from '../../../shared/types.ts';
import {
  buildTaobaoProductSnapshotFromPageModel,
  detectTaobaoProductDetailPage,
  isTaobaoProductSnapshotUseful,
  readTaobaoProductSnapshotFromDocument,
} from '../adapters/product-detail-collection-adapter.ts';
import { detectTaobaoSecurityChallenge } from '../adapters/security-challenge-adapter.ts';
import { collectTaobaoProductFromPageWorld } from './page-world-product-collector.ts';

interface PageWorldProductPayload {
  pageModel: unknown;
  detailImages: string[];
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function mergeSnapshot(primary: TaobaoProductSnapshot, fallback: TaobaoProductSnapshot): TaobaoProductSnapshot {
  return {
    ...primary,
    title: primary.title || fallback.title,
    shopName: primary.shopName || fallback.shopName,
    seller: primary.seller.shopName ? primary.seller : fallback.seller,
    priceRangeText: primary.priceRangeText || fallback.priceRangeText,
    mainImages: primary.mainImages.length > 0 ? primary.mainImages : fallback.mainImages,
    detailImages: primary.detailImages.length > 0 ? primary.detailImages : fallback.detailImages,
    skuGroups: primary.skuGroups.length > 0 ? primary.skuGroups : fallback.skuGroups,
    skuMatrix: primary.skuMatrix.length > 0 ? primary.skuMatrix : fallback.skuMatrix,
    salesText: primary.salesText || fallback.salesText,
    deliveryText: primary.deliveryText || fallback.deliveryText,
  };
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
    url: fallback.url,
    detailImages: pageWorldPayload.detailImages,
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
