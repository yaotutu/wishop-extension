import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');

function source(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

test('product listing collection uses typed runtime channels and a thin router registration', () => {
  assert.match(source('src/shared/runtime-channels.ts'), /'productListingCollection:open'/);
  assert.match(source('src/shared/runtime-channels.ts'), /'productListingCollection:complete'/);
  assert.match(source('src/shared/runtime-channels.ts'), /'productListingCollection:list'/);
  assert.match(source('src/shared/extension-api.ts'), /productListingCollection:/);
  assert.equal(existsSync(resolve(root, 'src/background/runtime-handlers/product-listing-collection-handlers.ts')), true);
  assert.match(source('src/background/router/create-background-router.ts'), /createProductListingCollectionRuntimeHandlers/);
});

test('product listing content flow is isolated from shipping and order lookup toolbars', () => {
  assert.equal(existsSync(resolve(root, 'src/content/taobao/runtime/product-listing-collection-workflow.ts')), true);
  assert.equal(existsSync(resolve(root, 'src/content/taobao/runtime/page-world-product-collector.ts')), true);
  assert.match(source('entrypoints/taobao.content.tsx'), /runProductListingCollectionWorkflow/);
});

test('product page model is read by a MAIN world content script instead of inline script injection', () => {
  assert.equal(existsSync(resolve(root, 'entrypoints/taobao-product-collector-main-world.content.ts')), true);
  assert.match(source('entrypoints/taobao-product-collector-main-world.content.ts'), /world: 'MAIN'/);
  assert.doesNotMatch(source('src/content/taobao/runtime/page-world-product-collector.ts'), /createElement\\('script'\\)/);
});
