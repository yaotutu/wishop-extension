import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const layoutSource = readFileSync(resolve(import.meta.dirname, '../src/components/Layout.tsx'), 'utf8');
const pageSource = readFileSync(resolve(import.meta.dirname, '../src/pages/product-listing/ProductListingPage.tsx'), 'utf8');

test('product listing is rendered inside the shared account workspace', () => {
  assert.match(
    layoutSource,
    /const ACCOUNT_MODULES = new Set<string>\(\[[^\]]*'productListing'[^\]]*\]\);/,
    'productListing should use the same left account sider as account-scoped modules',
  );

  assert.match(
    layoutSource,
    /activeModule === 'productListing' && <ProductListingPage accountId=\{activeAccount\.id\} accountName=\{activeAccount\.name\} \/>/,
    'ProductListingPage should receive the selected account from AccountModuleContent',
  );

  assert.doesNotMatch(
    layoutSource,
    /<ProductListingPage accounts=\{accounts\} activeAccountId=\{activeAccountId\} \/>/,
    'ProductListingPage should not be rendered from the non-account module branch',
  );
});

test('product listing page is a page-level wizard that ends at draft box creation', () => {
  assert.match(pageSource, /type ProductListingWizardStep = 'input' \| 'collectionPreview' \| 'draftPreview' \| 'completed';/);
  assert.match(pageSource, /const DRAFT_BOX_LISTING_VALUE = 0;/);
  assert.match(pageSource, /setCurrentStep\('collectionPreview'\);/);
  assert.match(pageSource, /setCurrentStep\('draftPreview'\);/);
  assert.match(pageSource, /setCurrentStep\('completed'\);/);

  assert.match(
    pageSource,
    /submitPreparedWxDraft\(\{[\s\S]*autoListing: false,[\s\S]*\}\)/,
    'final submit should always create a draft-box product and never auto submit audit',
  );

  assert.doesNotMatch(pageSource, /\bSwitch\b/, 'the submit-audit switch should not be present');
  assert.doesNotMatch(pageSource, /autoListing: draftPrepared\.request\.listing === 1/);
});
