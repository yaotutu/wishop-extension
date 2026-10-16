import type { ProductCopyCreatedProductRecord, ProductCopyRecord, WxProductDraftCreationResult } from '../../shared/types.ts';
import { extensionDb } from '../db/extension-db.ts';

function createdProductId(accountId: string, copyId: string): string {
  return `${accountId}:${copyId}`;
}

function parseCopyIdentity(copyId: string): Pick<ProductCopyCreatedProductRecord, 'platform' | 'itemId'> {
  const [platform, ...itemParts] = copyId.split(':');
  return {
    platform: platform === 'tmall' ? 'tmall' : 'taobao',
    itemId: itemParts.join(':').trim() || copyId,
  };
}

/**
 * 复制完成记录代表“这个淘宝商品已经在某个微信账号下创建过商品草稿”。
 * 它和采集快照分开保存，避免把只采集未创建的商品误判为重复复制。
 */
export async function saveProductCopyCreatedProduct(
  result: WxProductDraftCreationResult,
  source?: ProductCopyRecord | null,
): Promise<ProductCopyCreatedProductRecord> {
  const now = Date.now();
  const identity = source?.identity || parseCopyIdentity(result.copyId);
  const record: ProductCopyCreatedProductRecord = {
    id: createdProductId(result.accountId, result.copyId),
    accountId: result.accountId,
    copyId: result.copyId,
    platform: identity.platform,
    itemId: identity.itemId,
    sourceUrl: source?.sourceUrl || '',
    title: source?.title || result.productId,
    productId: result.productId,
    createdAt: now,
    updatedAt: now,
  };
  await extensionDb.productCopyCreatedProducts.put(record);
  return record;
}

export async function getProductCopyCreatedProduct(
  accountId: string,
  copyId: string,
): Promise<ProductCopyCreatedProductRecord | null> {
  return await extensionDb.productCopyCreatedProducts.get(createdProductId(accountId, copyId)) || null;
}

export async function removeProductCopyCreatedProduct(accountId: string, copyId: string): Promise<void> {
  await extensionDb.productCopyCreatedProducts.delete(createdProductId(accountId, copyId));
}
