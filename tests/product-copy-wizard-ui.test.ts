import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const layoutSource = readFileSync(resolve(import.meta.dirname, '../src/components/Layout.tsx'), 'utf8');
const pageSource = readFileSync(resolve(import.meta.dirname, '../src/pages/product-copy/ProductCopyPage.tsx'), 'utf8');
const parameterOptionsSource = readFileSync(resolve(import.meta.dirname, '../src/background/services/product-copy-parameter-options-service.ts'), 'utf8');
const listingClientSource = readFileSync(resolve(import.meta.dirname, '../src/background/wxshop/listing/api.ts'), 'utf8');

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
  assert.match(pageSource, /type ProductCopyWizardStep = 'input' \| 'collectionPreview' \| 'parameterSettings' \| 'draftPreview' \| 'completed';/);
  assert.match(pageSource, /const DRAFT_BOX_LISTING_VALUE = 0;/);
  assert.match(pageSource, /setCurrentStep\('collectionPreview'\);/);
  assert.match(pageSource, /setCurrentStep\('parameterSettings'\)/);
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

test('product copy parameters are configured before draft preview generation', () => {
  assert.match(pageSource, /title: '参数设置'/);
  assert.match(pageSource, /getDraftParameterOptions\(accountId\)/);
  assert.match(pageSource, /getCreatedProduct\(accountId, copyRecord\.id\)/);
  assert.match(pageSource, /autoCategoryMatch/);
  assert.match(pageSource, /autoCategoryMatch: true/);
  assert.match(pageSource, /<Checkbox>AI 自动识别<\/Checkbox>/);
  assert.match(pageSource, /\{!autoCategoryMatch && \(/);
  assert.match(pageSource, /duplicateFilter/);
  assert.match(pageSource, /expressTemplateId/);
  assert.match(pageSource, /afterSaleAddressId/);
  assert.match(pageSource, /defaultStockNum/);
  assert.match(pageSource, /生成草稿预览/);
  assert.match(
    pageSource,
    /prepareWxDraftBoxProduct\(\{[\s\S]*expressTemplateId: values\.expressTemplateId,[\s\S]*afterSaleAddressId: values\.afterSaleAddressId,[\s\S]*defaultStockNum: values\.defaultStockNum/,
  );
  assert.match(parameterOptionsSource, /client\.getFreightTemplates\(\)/);
  assert.match(parameterOptionsSource, /\$\{name\}（ID：\$\{template\.templateId\}）/);
  assert.match(parameterOptionsSource, /模板 ID：\$\{template\.templateId\}/);
  assert.doesNotMatch(parameterOptionsSource, /未命名模[板版]/);
  assert.match(listingClientSource, /fillFreightTemplateName/);
  assert.match(listingClientSource, /requestFreightTemplateDetail/);
});

test('product copy preview images retry Taobao CDN images through local blob urls', () => {
  assert.match(pageSource, /const ProductCopyPreviewImage: React\.FC<ProductCopyPreviewImageProps>/);
  assert.match(pageSource, /fetch\(url, \{ credentials: 'include' \}\)/);
  assert.match(pageSource, /URL\.createObjectURL\(blob\)/);
  assert.match(pageSource, /URL\.revokeObjectURL\(objectUrlRef\.current\)/);
  assert.match(pageSource, /<ProductCopyPreviewImage[\s\S]*url=\{url\}[\s\S]*detail=\{detail\}/);
});
