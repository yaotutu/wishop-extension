import assert from 'node:assert/strict';
import test from 'node:test';
import 'fake-indexeddb/auto';
import { extensionDb } from '../src/background/db/extension-db.ts';
import {
  listProductCopyRecords,
  removeProductCopyRecord,
  saveProductCopyRecord,
} from '../src/background/store/product-copy-record-repository.ts';
import {
  getProductCopyCreatedProduct,
  removeProductCopyCreatedProduct,
  saveProductCopyCreatedProduct,
} from '../src/background/store/product-copy-created-product-repository.ts';
import type { ProductCopyRecord, WxProductDraftCreationResult } from '../src/shared/types.ts';
import { sampleProductCopyRecord } from './product-copy-fixtures.ts';

function sampleListing(patch: Partial<ProductCopyRecord> = {}): ProductCopyRecord {
  return sampleProductCopyRecord({ title: '适用kindle充电传输数据线', ...patch });
}

async function resetDb(): Promise<void> {
  await extensionDb.delete();
  await extensionDb.open();
}

test('product copy records are saved, listed newest first, overwritten by platform item id, and removable', async () => {
  await resetDb();

  const first = await saveProductCopyRecord(sampleListing({ title: '第一次采集' }));
  const overwritten = await saveProductCopyRecord(sampleListing({
    title: '第二次采集',
    collectedAt: 1700000005000,
    updatedAt: 1700000005000,
  }));
  await saveProductCopyRecord(sampleListing({
    id: 'taobao:222',
    identity: {
      url: 'https://item.taobao.com/item.htm?id=222',
      platform: 'taobao',
      itemId: '222',
    },
    title: '另一个商品',
    sourceUrl: 'https://item.taobao.com/item.htm?id=222',
    collectedAt: 1700000010000,
    updatedAt: 1700000010000,
  }));

  assert.equal(first.id, 'taobao:1010211244888');
  assert.equal(overwritten.id, first.id);

  const listings = await listProductCopyRecords();
  assert.deepEqual(listings.map(item => item.title), ['另一个商品', '第二次采集']);

  await removeProductCopyRecord('taobao:1010211244888');

  assert.deepEqual((await listProductCopyRecords()).map(item => item.id), ['taobao:222']);
});

test('created product records track completed product copies per account and copy id', async () => {
  await resetDb();

  const source = sampleListing();
  const result: WxProductDraftCreationResult = {
    accountId: 'account-1',
    copyId: source.id,
    productId: '987654321',
    createTime: '2026-06-01 12:00:00',
    listing: 0,
    uploadedImageCount: 5,
  };

  await saveProductCopyCreatedProduct(result, source);
  const record = await getProductCopyCreatedProduct('account-1', source.id);

  assert.equal(record?.productId, '987654321');
  assert.equal(record?.platform, 'taobao');
  assert.equal(record?.itemId, '1010211244888');
  assert.equal(record?.title, source.title);

  await removeProductCopyCreatedProduct('account-1', source.id);

  assert.equal(await getProductCopyCreatedProduct('account-1', source.id), null);
});
