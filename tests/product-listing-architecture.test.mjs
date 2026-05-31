import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');

function source(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

test('Taobao content entrypoint is named for shared Taobao workflows', () => {
  assert.equal(existsSync(resolve(root, 'entrypoints/taobao.content.tsx')), true);
  assert.equal(existsSync(resolve(root, 'entrypoints/taobao-shipping.content.tsx')), false);
  assert.match(source('entrypoints/taobao.content.tsx'), /defineContentScript\(/);
});

test('product listing has an independent dashboard module boundary', () => {
  const layout = source('src/components/Layout.tsx');
  const preferences = source('src/stores/dashboard-ui-preferences-store.ts');

  assert.equal(existsSync(resolve(root, 'src/pages/product-listing/ProductListingPage.tsx')), true);
  assert.match(layout, /lazy\(\(\) => import\('\.\.\/pages\/product-listing\/ProductListingPage'\)\)/);
  assert.match(layout, /\{ key: 'productListing', label: '上货管理' \}/);
  assert.match(layout, /activeModule === 'productListing'/);
  assert.match(preferences, /'productListing'/);
  assert.match(layout, /activeModule === 'commonFunctions' && <ListingPage/);
});

test('product detail collection adapter is decomposed behind a small public API', () => {
  const adapter = source('src/content/taobao/adapters/product-detail-collection-adapter.ts');

  assert.match(adapter, /export function detectTaobaoProductDetailPage/);
  assert.match(adapter, /export function readTaobaoProductSnapshot/);
  assert.match(adapter, /export function readTaobaoProductSnapshotFromDocument/);
  assert.match(adapter, /export function isTaobaoProductSnapshotUseful/);
  assert.match(adapter, /function readProductTitle/);
  assert.match(adapter, /function readPriceRangeText/);
  assert.match(adapter, /function readProductImages/);
  assert.match(adapter, /function readSkuGroups/);
  assert.match(adapter, /function readSkuMatrix/);
  assert.match(adapter, /export function readSkuMatrixFromText/);
});
