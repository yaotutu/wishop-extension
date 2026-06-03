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
  assert.match(layout, /activeModule === 'commonFunctions' && <ProductAuditPage/);
});

test('product audit rules are only editable from the global product audit page', () => {
  const page = source('src/pages/common-functions/ProductAuditPage.tsx');

  assert.match(page, /if \(scope === 'global'\)/);
  assert.match(page, /globalView === 'tasks' \? renderGlobalTasksSection\(\) : renderRulesSection\(\)/);
  assert.doesNotMatch(page, /handleAddRuleFromLog/);
  assert.doesNotMatch(page, /handleAddKeywordKeepRule/);
});

test('product audit task config does not carry account-local failure policy', () => {
  const types = source('src/shared/types.ts');
  const configBlock = types.match(/export interface ProductAuditTaskConfig \{[\s\S]*?\n\}/)?.[0] || '';

  assert.doesNotMatch(configBlock, /defaultFailureAction/);
  assert.match(types, /export interface ProductAuditFailurePolicy/);
});

test('product listing preview renders collected detail images', () => {
  const page = source('src/pages/product-listing/ProductListingPage.tsx');

  assert.match(page, /title: '图片'/);
  assert.match(page, /record\.images\.detail\.length/);
  assert.match(page, /图文详情/);
  assert.match(page, /previewListing\.images\.detail\.map/);
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
