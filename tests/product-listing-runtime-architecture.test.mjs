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
  assert.match(source('src/shared/runtime-channels.ts'), /'productListingCollection:prepareWxDraftBoxProduct'/);
  assert.match(source('src/shared/runtime-channels.ts'), /'productListingCollection:createPreparedWxDraftBoxProduct'/);
  assert.match(source('src/shared/runtime-channels.ts'), /'productListingCollection:createWxDraftBoxProduct'/);
  assert.match(source('src/shared/runtime-channels.ts'), /'productListingCollection:deleteCreatedWxDraftBoxProduct'/);
  assert.doesNotMatch(source('src/shared/runtime-channels.ts'), /'productListingCollection:prepareWxDraft'/);
  assert.doesNotMatch(source('src/shared/runtime-channels.ts'), /'productListingCollection:submitPreparedWxDraft'/);
  assert.doesNotMatch(source('src/shared/runtime-channels.ts'), /'productListingCollection:createWxDraft'/);
  assert.match(source('src/shared/extension-api.ts'), /productListingCollection:/);
  assert.match(source('src/shared/extension-api.ts'), /prepareWxDraftBoxProduct/);
  assert.match(source('src/shared/extension-api.ts'), /createPreparedWxDraftBoxProduct/);
  assert.match(source('src/shared/extension-api.ts'), /createWxDraftBoxProduct/);
  assert.match(source('src/shared/extension-api.ts'), /deleteCreatedWxDraftBoxProduct/);
  assert.doesNotMatch(source('src/shared/extension-api.ts'), /submitPreparedWxDraft/);
  assert.equal(existsSync(resolve(root, 'src/background/runtime-handlers/product-listing-collection-handlers.ts')), true);
  assert.match(source('src/background/router/create-background-router.ts'), /createProductListingCollectionRuntimeHandlers/);
  assert.match(source('src/background/router/create-background-router.ts'), /'productListingCollection:deleteCreatedWxDraftBoxProduct': 'listing'/);
});

test('product audit owns pre-audit category precheck instead of product listing draft-box flow', () => {
  assert.match(source('src/shared/runtime-channels.ts'), /'productAudit:precheckCategory'/);
  assert.match(source('src/shared/extension-api.ts'), /precheckCategory/);
  assert.equal(existsSync(resolve(root, 'src/background/services/product-audit-precheck-service.ts')), true);
  assert.doesNotMatch(source('src/background/services/product-listing-wx-draft-service.ts'), /shouldRunCategoryPrecheckBeforeSubmit/);
  assert.doesNotMatch(source('src/background/services/product-listing-wx-draft-service.ts'), /precheckProductCategory/);
  assert.doesNotMatch(source('src/background/services/product-listing-wx-draft-mapper.ts'), /autoListing/);
  assert.doesNotMatch(source('src/background/services/product-listing-wx-draft-mapper.ts'), /listing:\s*1/);
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
