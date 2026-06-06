import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');

function source(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

test('product copy collection uses typed runtime channels and a thin router registration', () => {
  assert.match(source('src/shared/runtime-channels.ts'), /'productCopy:open'/);
  assert.match(source('src/shared/runtime-channels.ts'), /'productCopy:complete'/);
  assert.match(source('src/shared/runtime-channels.ts'), /'productCopy:list'/);
  assert.match(source('src/shared/runtime-channels.ts'), /'productCopy:prepareWxDraftBoxProduct'/);
  assert.match(source('src/shared/runtime-channels.ts'), /'productCopy:createPreparedWxDraftBoxProduct'/);
  assert.match(source('src/shared/runtime-channels.ts'), /'productCopy:createWxDraftBoxProduct'/);
  assert.match(source('src/shared/runtime-channels.ts'), /'productCopy:deleteCreatedWxDraftBoxProduct'/);
  assert.doesNotMatch(source('src/shared/runtime-channels.ts'), /'productCopy:prepareWxDraft'/);
  assert.doesNotMatch(source('src/shared/runtime-channels.ts'), /'productCopy:submitPreparedWxDraft'/);
  assert.doesNotMatch(source('src/shared/runtime-channels.ts'), /'productCopy:createWxDraft'/);
  assert.match(source('src/shared/extension-api.ts'), /productCopy:/);
  assert.match(source('src/shared/extension-api.ts'), /prepareWxDraftBoxProduct/);
  assert.match(source('src/shared/extension-api.ts'), /createPreparedWxDraftBoxProduct/);
  assert.match(source('src/shared/extension-api.ts'), /createWxDraftBoxProduct/);
  assert.match(source('src/shared/extension-api.ts'), /deleteCreatedWxDraftBoxProduct/);
  assert.doesNotMatch(source('src/shared/extension-api.ts'), /submitPreparedWxDraft/);
  assert.equal(existsSync(resolve(root, 'src/background/runtime-handlers/product-copy-handlers.ts')), true);
  assert.match(source('src/background/router/create-background-router.ts'), /createProductCopyRuntimeHandlers/);
  assert.match(source('src/background/router/create-background-router.ts'), /'productCopy:deleteCreatedWxDraftBoxProduct': 'productCopy'/);
});

test('product audit owns pre-audit category precheck instead of product copy draft-box flow', () => {
  assert.match(source('src/shared/runtime-channels.ts'), /'productAudit:precheckCategory'/);
  assert.match(source('src/shared/extension-api.ts'), /precheckCategory/);
  assert.equal(existsSync(resolve(root, 'src/background/services/product-audit-precheck-service.ts')), true);
  assert.doesNotMatch(source('src/background/services/product-copy-wx-draft-service.ts'), /shouldRunCategoryPrecheckBeforeSubmit/);
  assert.doesNotMatch(source('src/background/services/product-copy-wx-draft-service.ts'), /precheckProductCategory/);
  assert.doesNotMatch(source('src/background/services/product-copy-wx-draft-mapper.ts'), /listing:\s*1/);
});

test('product copy content flow is isolated from shipping and order lookup toolbars', () => {
  assert.equal(existsSync(resolve(root, 'src/content/taobao/runtime/product-copy-workflow.ts')), true);
  assert.equal(existsSync(resolve(root, 'src/content/taobao/runtime/page-world-product-collector.ts')), true);
  assert.match(source('entrypoints/taobao.content.tsx'), /runProductCopyWorkflow/);
});

test('product page model is read by a MAIN world content script instead of inline script injection', () => {
  assert.equal(existsSync(resolve(root, 'entrypoints/taobao-product-collector-main-world.content.ts')), true);
  assert.match(source('entrypoints/taobao-product-collector-main-world.content.ts'), /world: 'MAIN'/);
  assert.doesNotMatch(source('src/content/taobao/runtime/page-world-product-collector.ts'), /createElement\\('script'\\)/);
});
