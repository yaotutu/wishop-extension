# Taobao Product Collection Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Taobao product collection as a broad page snapshot that stores rich product facts, image assets, detail content, SKU identifiers, sanitized page model data, and collection diagnostics.

**Architecture:** Keep the existing WXT content-script flow and background session queue. Expand shared collection types, collect richer data in the MAIN world script, normalize it in the product detail adapter, clear old product copy records during storage migration, and update UI/mapper/tests to consume the new structure directly.

**Tech Stack:** WXT, TypeScript, React, Dexie, node:test.

---

### Task 1: Define The New Collection Snapshot Contract

**Files:**
- Modify: `src/shared/types.ts`
- Test: `tests/taobao-product-collection-adapter.test.ts`

- [ ] Add explicit image asset, detail content, SKU property, raw model, and diagnostics types to `src/shared/types.ts`.
- [ ] Replace flat `TaobaoProductSnapshot` fields with grouped `identity`, `shop`, `category`, `price`, `images`, `detail`, `sku`, `rawModel`, and `diagnostics` fields.
- [ ] Update `ProductCopyRecord` to use the new snapshot shape and keep `id`, `missingFields`, and `updatedAt`.

### Task 2: Make Adapter Tests Fail For Rich Snapshot Data

**Files:**
- Modify: `tests/taobao-product-collection-adapter.test.ts`

- [ ] Update page-model tests to assert `pid` and `vid` are preserved in SKU specs.
- [ ] Assert `images.assets` includes main, detail, and SKU image roles with source labels.
- [ ] Assert `detail.text` is captured from supplied detail content.
- [ ] Assert `rawModel` retains whitelisted product data and removes private fields.
- [ ] Assert `diagnostics` records model and DOM/detail image collection sources.

Run: `node --test tests/taobao-product-collection-adapter.test.ts`
Expected: FAIL because the new snapshot fields are not implemented yet.

### Task 3: Implement Rich Adapter Mapping

**Files:**
- Modify: `src/content/taobao/adapters/product-detail-collection-adapter.ts`
- Modify: `src/content/taobao/runtime/product-copy-workflow.ts`

- [ ] Extend adapter input to accept detail content and image asset candidates.
- [ ] Build rich snapshot groups from the sanitized page model.
- [ ] Generate image assets for model main images, detail images, and SKU images.
- [ ] Preserve `pid` and `vid` on SKU groups, SKU properties, and SKU matrix specs.
- [ ] Add diagnostics for model availability, detail source, fallback usage, and warnings.
- [ ] Update snapshot merge logic to merge grouped structures without losing richer source data.

Run: `node --test tests/taobao-product-collection-adapter.test.ts`
Expected: PASS.

### Task 4: Expand MAIN World Collection

**Files:**
- Modify: `entrypoints/taobao-product-collector-main-world.content.ts`
- Modify: `src/content/taobao/runtime/page-world-product-collector.ts`

- [ ] Return sanitized raw page model, detail text, detail image assets, and image DOM metadata from MAIN world.
- [ ] Capture lazy attributes, `width`, `height`, `naturalWidth`, `naturalHeight`, source selector, and role hints.
- [ ] Keep recursive sensitive-key filtering for user, buyer, address, phone, token, cookie, passport, receiver, and recipient.

Run: `node --test tests/taobao-product-collection-adapter.test.ts tests/detail-image-stability.test.ts`
Expected: PASS.

### Task 5: Clear Old Product Copy Records

**Files:**
- Modify: `src/background/store/core.ts`
- Modify: `src/background/store/migrations.ts`
- Test: `tests/product-copy-record-repository.test.ts`

- [ ] Increment `CURRENT_STORAGE_VERSION`.
- [ ] Add a migration that clears `extensionDb.productCopyRecords`.
- [ ] Add or update a test proving old product copy records are removed.

Run: `node --test tests/product-copy-record-repository.test.ts`
Expected: PASS.

### Task 6: Update Consumers For New Snapshot Shape

**Files:**
- Modify: `src/background/services/product-copy-session-service.ts`
- Modify: `src/background/services/product-copy-wx-draft-mapper.ts`
- Modify: `src/background/services/product-copy-ai-draft-service.ts`
- Modify: `src/background/services/taobao-itemcat-lookup.ts`
- Modify: `src/background/services/product-copy-category-lookup.ts`
- Modify: `src/pages/product-copy/ProductCopyPage.tsx`
- Modify: related tests under `tests/`

- [ ] Update missing-field checks for grouped fields.
- [ ] Update UI display to read grouped identity, shop, price, images, detail, params, and SKU data.
- [ ] Update mapper and AI prompt helpers to read from the new shape.
- [ ] Update category enrichment to use `category.source`.
- [ ] Keep conversion logic simple and defer business filtering decisions.

Run: `npm run compile`
Expected: PASS.

### Task 7: Final Verification

**Files:**
- All modified files.

- [ ] Run focused tests: `node --test tests/taobao-product-collection-adapter.test.ts tests/detail-image-stability.test.ts tests/product-copy-record-repository.test.ts tests/product-copy-wx-draft-mapper.test.ts tests/product-copy-wx-draft-service.test.ts tests/product-copy-ai-draft-service.test.ts tests/taobao-itemcat-lookup.test.ts tests/product-copy-category-lookup.test.ts`
- [ ] Run `npm run compile`.
- [ ] If background/runtime files changed, run `npm run build`.
