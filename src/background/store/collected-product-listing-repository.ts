import type { CollectedProductListing } from '../../shared/types.ts';
import { extensionDb } from '../db/extension-db.ts';

function collectionId(listing: Pick<CollectedProductListing, 'identity'>): string {
  return `${listing.identity.platform}:${listing.identity.itemId}`;
}

/**
 * 采集结果以后会作为微信小店上架草稿的来源数据，所以这里按平台商品 ID 覆盖保存。
 * 同一个淘宝商品多次采集时保留最新数据，避免 UI 和后续上架流程出现多个候选版本。
 */
export async function saveCollectedProductListing(input: CollectedProductListing): Promise<CollectedProductListing> {
  const now = Date.now();
  const id = collectionId(input);
  const existing = await extensionDb.collectedProductListings.get(id);
  const listing: CollectedProductListing = {
    ...input,
    id,
    updatedAt: input.updatedAt || now,
    collectedAt: input.collectedAt || existing?.collectedAt || now,
  };
  await extensionDb.collectedProductListings.put(listing);
  return listing;
}

export async function listCollectedProductListings(): Promise<CollectedProductListing[]> {
  const listings = await extensionDb.collectedProductListings
    .orderBy('updatedAt')
    .reverse()
    .toArray();
  return listings;
}

export async function getCollectedProductListing(id: string): Promise<CollectedProductListing | null> {
  return await extensionDb.collectedProductListings.get(id) || null;
}

export async function removeCollectedProductListing(id: string): Promise<void> {
  await extensionDb.collectedProductListings.delete(id);
}
