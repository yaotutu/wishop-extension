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

test('product copy is the only top-level dashboard module in product-copy-only build', () => {
  const layout = source('src/components/Layout.tsx');
  const preferences = source('src/stores/dashboard-ui-preferences-store.ts');

  assert.equal(existsSync(resolve(root, 'src/pages/product-copy/ProductCopyPage.tsx')), true);
  assert.match(layout, /lazy\(\(\) => import\('\.\.\/pages\/product-copy\/ProductCopyPage'\)\)/);
  assert.match(layout, /\{ key: 'productCopy', label: '复制商品' \}/);
  assert.match(layout, /activeModule === 'productCopy'/);
  assert.match(preferences, /'productCopy'/);
  // product-copy-only build 已经删了 commonFunctions / ProductAuditPage。
  assert.equal(existsSync(resolve(root, 'src/pages/common-functions/ProductAuditPage.tsx')), false);
  assert.doesNotMatch(layout, /commonFunctions/);
});

test('product audit task config does not carry account-local failure policy', () => {
  const types = source('src/shared/types.ts');
  const configBlock = types.match(/export interface ProductAuditTaskConfig \{[\s\S]*?\n\}/)?.[0] || '';

  assert.doesNotMatch(configBlock, /defaultFailureAction/);
  assert.match(types, /export interface ProductAuditFailurePolicy/);
});

test('product copy preview renders detail images', () => {
  const page = source('src/pages/product-copy/ProductCopyPage.tsx');

  assert.match(page, /function renderImageGroup/);
  assert.match(page, /<Image\.PreviewGroup>/);
  assert.match(page, /图文详情/);
  assert.match(page, /renderImageGroup\(listing\.images\.detail, '商品详情图', true\)/);
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
