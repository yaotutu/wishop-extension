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
  assert.match(source('src/shared/runtime-channels.ts'), /'productCopy:getDraftParameterOptions'/);
  assert.match(source('src/shared/runtime-channels.ts'), /'productCopy:getCreatedProduct'/);
  assert.match(source('src/shared/runtime-channels.ts'), /'productCopy:getDefaultSettings'/);
  assert.match(source('src/shared/runtime-channels.ts'), /'productCopy:saveDefaultSettings'/);
  assert.match(source('src/shared/runtime-channels.ts'), /'productCopy:prepareWxDraftBoxProduct'/);
  assert.match(source('src/shared/runtime-channels.ts'), /'productCopy:createPreparedWxDraftBoxProduct'/);
  assert.match(source('src/shared/runtime-channels.ts'), /'productCopy:createWxDraftBoxProduct'/);
  assert.match(source('src/shared/runtime-channels.ts'), /'productCopy:deleteCreatedWxDraftBoxProduct'/);
  assert.doesNotMatch(source('src/shared/runtime-channels.ts'), /'productCopy:prepareWxDraft'/);
  assert.doesNotMatch(source('src/shared/runtime-channels.ts'), /'productCopy:submitPreparedWxDraft'/);
  assert.doesNotMatch(source('src/shared/runtime-channels.ts'), /'productCopy:createWxDraft'/);
  assert.match(source('src/shared/extension-api.ts'), /productCopy:/);
  assert.match(source('src/shared/extension-api.ts'), /getDraftParameterOptions/);
  assert.match(source('src/shared/extension-api.ts'), /getCreatedProduct/);
  assert.match(source('src/shared/extension-api.ts'), /getDefaultSettings/);
  assert.match(source('src/shared/extension-api.ts'), /saveDefaultSettings/);
  assert.match(source('src/shared/extension-api.ts'), /prepareWxDraftBoxProduct/);
  assert.match(source('src/shared/extension-api.ts'), /createPreparedWxDraftBoxProduct/);
  assert.match(source('src/shared/extension-api.ts'), /createWxDraftBoxProduct/);
  assert.match(source('src/shared/extension-api.ts'), /deleteCreatedWxDraftBoxProduct/);
  assert.doesNotMatch(source('src/shared/extension-api.ts'), /submitPreparedWxDraft/);
  assert.equal(existsSync(resolve(root, 'src/background/runtime-handlers/product-copy-handlers.ts')), true);
  // product-copy-only build：router 不再传 feature map（鉴权域被一并移除），但 productCopy
  // 这组 channel 必须仍被 createProductCopyRuntimeHandlers 注册。
  assert.match(source('src/background/router/create-background-router.ts'), /createProductCopyRuntimeHandlers/);
  assert.match(source('src/background/router/create-background-router.ts'), /\.\.\.createProductCopyRuntimeHandlers\(/);
});

test('product copy draft-box flow does not depend on the removed product audit precheck service', () => {
  // product-audit-precheck-service 已被删除；product-copy 草稿箱流程必须不再依赖它。
  assert.equal(existsSync(resolve(root, 'src/background/services/product-audit-precheck-service.ts')), false);
  assert.doesNotMatch(source('src/shared/runtime-channels.ts'), /'productAudit:precheckCategory'/);
  assert.doesNotMatch(source('src/shared/extension-api.ts'), /precheckCategory/);
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
