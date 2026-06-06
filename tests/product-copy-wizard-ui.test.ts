import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const layoutSource = readFileSync(resolve(import.meta.dirname, '../src/components/Layout.tsx'), 'utf8');
const pageSource = readFileSync(resolve(import.meta.dirname, '../src/pages/product-copy/ProductCopyPage.tsx'), 'utf8');

test('product copy is rendered inside the shared account workspace', () => {
  assert.match(
    layoutSource,
    /const ACCOUNT_MODULES = new Set<string>\(\[[^\]]*'productCopy'[^\]]*\]\);/,
    'productCopy should use the same left account sider as account-scoped modules',
  );

  assert.match(
    layoutSource,
    /activeModule === 'productCopy' && <ProductCopyPage accountId=\{activeAccount\.id\} accountName=\{activeAccount\.name\} \/>/,
    'ProductCopyPage should receive the selected account from AccountModuleContent',
  );

  assert.doesNotMatch(
    layoutSource,
    /<ProductCopyPage accounts=\{accounts\} activeAccountId=\{activeAccountId\} \/>/,
    'ProductCopyPage should not be rendered from the non-account module branch',
  );
});

test('product copy page is a page-level wizard that ends at draft box creation', () => {
  assert.match(pageSource, /type ProductCopyWizardStep = 'input' \| 'collectionPreview' \| 'draftPreview' \| 'completed';/);
  assert.match(pageSource, /const DRAFT_BOX_LISTING_VALUE = 0;/);
  assert.match(pageSource, /setCurrentStep\('collectionPreview'\);/);
  assert.match(pageSource, /setCurrentStep\('draftPreview'\);/);
  assert.match(pageSource, /setCurrentStep\('completed'\);/);

  assert.match(
    pageSource,
    /createPreparedWxDraftBoxProduct\(\{[\s\S]*listing: DRAFT_BOX_LISTING_VALUE,[\s\S]*\}\)/,
    'final submit should use the explicit draft-box command and force listing=0',
  );
  assert.match(pageSource, /Modal\.confirm\(\{[\s\S]*title: '测试完成'[\s\S]*okText: '删除'[\s\S]*cancelText: '保留'/);
  assert.match(pageSource, /deleteCreatedWxDraftBoxProduct\(\{[\s\S]*productId: result\.productId/);

  assert.doesNotMatch(pageSource, /\bSwitch\b/, 'the submit-audit switch should not be present');
  assert.doesNotMatch(pageSource, /submitPreparedWxDraft\(/);
  assert.doesNotMatch(pageSource, /listing:\s*1/);
  assert.doesNotMatch(pageSource, /extensionApi\.drafts\.delete/);
});

test('product copy preview images retry Taobao CDN images through local blob urls', () => {
  assert.match(pageSource, /const ProductCopyPreviewImage: React\.FC<ProductCopyPreviewImageProps>/);
  assert.match(pageSource, /fetch\(url, \{ credentials: 'include' \}\)/);
  assert.match(pageSource, /URL\.createObjectURL\(blob\)/);
  assert.match(pageSource, /URL\.revokeObjectURL\(objectUrlRef\.current\)/);
  assert.match(pageSource, /<ProductCopyPreviewImage[\s\S]*url=\{url\}[\s\S]*detail=\{detail\}/);
});
