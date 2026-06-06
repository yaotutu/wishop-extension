import assert from 'node:assert/strict';
import test from 'node:test';
import 'fake-indexeddb/auto';
import { extensionDb } from '../src/background/db/extension-db.ts';
import {
  listProductCopyRecords,
  removeProductCopyRecord,
  saveProductCopyRecord,
} from '../src/background/store/product-copy-record-repository.ts';
import type { ProductCopyRecord } from '../src/shared/types.ts';
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
