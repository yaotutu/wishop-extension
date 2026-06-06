import type { ProductCopyRecord } from '../../shared/types.ts';
import { extensionDb } from '../db/extension-db.ts';

function collectionId(listing: Pick<ProductCopyRecord, 'identity'>): string {
  return `${listing.identity.platform}:${listing.identity.itemId}`;
}

/**
 * 采集结果以后会作为微信小店草稿箱商品的来源数据，所以这里按平台商品 ID 覆盖保存。
 * 同一个淘宝商品多次采集时保留最新数据，避免 UI 和后续复制商品流程出现多个候选版本。
 */
export async function saveProductCopyRecord(input: ProductCopyRecord): Promise<ProductCopyRecord> {
  const now = Date.now();
  const id = collectionId(input);
  const existing = await extensionDb.productCopyRecords.get(id);
  const listing: ProductCopyRecord = {
    ...input,
    id,
    updatedAt: input.updatedAt || now,
    collectedAt: input.collectedAt || existing?.collectedAt || now,
  };
  await extensionDb.productCopyRecords.put(listing);
  return listing;
}

export async function listProductCopyRecords(): Promise<ProductCopyRecord[]> {
  const listings = await extensionDb.productCopyRecords
    .orderBy('updatedAt')
    .reverse()
    .toArray();
  return listings;
}

export async function getProductCopyRecord(id: string): Promise<ProductCopyRecord | null> {
  return await extensionDb.productCopyRecords.get(id) || null;
}

export async function removeProductCopyRecord(id: string): Promise<void> {
  await extensionDb.productCopyRecords.delete(id);
}
