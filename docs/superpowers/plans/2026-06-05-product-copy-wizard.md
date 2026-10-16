# Product Copy Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework 复制商品 into an account-scoped page wizard that collects a Taobao/Tmall product, previews the collected data, converts it to a WeChat draft request, and creates a draft-box product only.

**Architecture:** Reuse the existing background IPC and product copy services. Move `productCopy` into the shared account layout, then refactor `ProductCopyPage` into a single page-level wizard with local UI state and read-only preview panels. Keep the history list as non-primary scope for now.

**Tech Stack:** WXT, React 19, TypeScript, TanStack Query, Ant Design 6.

---

## File Structure

- Modify: `src/components/Layout.tsx`
  - Add `productCopy` to `ACCOUNT_MODULES`.
  - Render `ProductCopyPage` through `AccountModuleContent` with the selected account.
  - Remove the non-account scoped product copy branch.

- Modify: `src/pages/product-copy/ProductCopyPage.tsx`
  - Replace the list-and-modal interaction with a page-level wizard.
  - Keep existing collection IPC, category suggestion IPC, draft preparation IPC, and draft submission IPC.
  - Remove account selector and post-creation audit switch.
  - Force `request.listing = 0` in the page flow.
  - Add read-only collection and draft preview sections.

- Backend and shared channels use the `productCopy` namespace.

## Task 1: Make 复制商品 Account-Scoped

**Files:**
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Add productCopy to account modules**

Change:

```ts
const ACCOUNT_MODULES = new Set<string>(['orders', 'commonFunctions', 'violation']);
```

to:

```ts
const ACCOUNT_MODULES = new Set<string>(['orders', 'productCopy', 'commonFunctions', 'violation']);
```

- [ ] **Step 2: Render ProductCopyPage from AccountModuleContent**

Inside `AccountModuleContent`, add product copy to the account-scoped body:

```tsx
{activeModule === 'orders' && <OrdersPage scope={orderScope} accounts={accounts} />}
{activeModule === 'productCopy' && <ProductCopyPage accountId={activeAccount.id} accountName={activeAccount.name} />}
{activeModule === 'commonFunctions' && <ProductAuditPage accountId={activeAccount.id} accounts={accounts} scope="account" />}
{activeModule === 'violation' && <ViolationPage accountId={activeAccount.id} />}
```

- [ ] **Step 3: Remove old non-account ProductCopyPage branch**

Delete the later branch:

```tsx
{activeModule === 'productCopy' && (
  <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
    <ProductCopyPage accounts={accounts} activeAccountId={activeAccountId} />
  </div>
)}
```

- [ ] **Step 4: Compile after the layout change**

Run:

```bash
npm run compile
```

Expected at this stage: it may fail until Task 2 updates `ProductCopyPage` props. The useful signal is that the failure is limited to product copy prop types, not unrelated layout errors.

## Task 2: Refactor ProductCopyPage State and Entry Flow

**Files:**
- Modify: `src/pages/product-copy/ProductCopyPage.tsx`

- [ ] **Step 1: Replace props and remove draft form state**

Use account-scoped props:

```ts
interface ProductCopyPageProps {
  accountId: string;
  accountName?: string;
}
```

Remove:

```ts
interface WxDraftFormValues {
  accountId: string;
  catIdsText?: string;
  brandId?: string;
}
```

Remove the draft Ant Design form:

```ts
const [draftForm] = Form.useForm<WxDraftFormValues>();
```

- [ ] **Step 2: Add wizard state**

Add:

```ts
type ProductCopyWizardStep = 'input' | 'collectionPreview' | 'draftPreview' | 'completed';

const DEFAULT_BRAND_ID = '2100000000';
const DRAFT_BOX_LISTING_VALUE = 0;
```

Use state:

```ts
const [currentStep, setCurrentStep] = useState<ProductCopyWizardStep>('input');
const [activeSession, setActiveSession] = useState<ProductCopySession | null>(null);
const [copyRecord, setCopyRecord] = useState<ProductCopyRecord | null>(null);
const [draftPrepared, setDraftPrepared] = useState<WxProductDraftPrepareResult | null>(null);
const [draftSuggestion, setDraftSuggestion] = useState<WxProductDraftSuggestionResult | null>(null);
const [draftSubmittedResult, setDraftSubmittedResult] = useState<WxProductDraftCreationResult | null>(null);
const [fullCategoryStatus, setFullCategoryStatus] = useState('');
```

- [ ] **Step 3: Reset wizard when account changes**

Add a reset helper:

```ts
const resetWizard = useCallback(() => {
  form.resetFields();
  setCurrentStep('input');
  setActiveSession(null);
  setCopyRecord(null);
  setDraftPrepared(null);
  setDraftSuggestion(null);
  setDraftSubmittedResult(null);
  setFullCategoryStatus('');
}, [form]);
```

Add account-change reset:

```ts
useEffect(() => {
  resetWizard();
}, [accountId, resetWizard]);
```

- [ ] **Step 4: Update collection completion**

On collection completion:

```ts
setActiveSession(null);
setCopyRecord(listing);
setCurrentStep('collectionPreview');
setDraftPrepared(null);
setDraftSuggestion(null);
setDraftSubmittedResult(null);
setFullCategoryStatus('');
```

Keep the existing query cache update.

## Task 3: Implement the Page Wizard Shell

**Files:**
- Modify: `src/pages/product-copy/ProductCopyPage.tsx`

- [ ] **Step 1: Add step mapping**

Add:

```ts
const wizardStepIndex: Record<ProductCopyWizardStep, number> = {
  input: 0,
  collectionPreview: 1,
  draftPreview: 2,
  completed: 3,
};
```

Render:

```tsx
<Steps
  size="small"
  current={wizardStepIndex[currentStep]}
  items={[
    { title: '输入链接' },
    { title: '采集预览' },
    { title: '草稿预览' },
    { title: '创建完成' },
  ]}
/>
```

- [ ] **Step 2: Build input step**

Render a primary `Card` with the current account name, URL form, and collection status:

```tsx
<Form form={form} layout="vertical" onFinish={handleCollect}>
  <Form.Item name="url" label="淘宝/天猫商品链接" rules={[{ required: true, message: '请输入淘宝或天猫商品链接' }]}>
    <Input allowClear placeholder="https://item.taobao.com/item.htm?id=..." disabled={collectMutation.isPending} />
  </Form.Item>
  <Button type="primary" htmlType="submit" icon={<ImportOutlined />} loading={collectMutation.isPending}>
    开始采集
  </Button>
</Form>
```

- [ ] **Step 3: Remove table-first primary layout**

Remove the old primary cards:

- `商品采集`
- `本地采集商品`
- Preview `Drawer`
- Draft `Modal`

The history query can remain loaded for cache consistency, but the main screen should not depend on a table workflow.

## Task 4: Build the Read-Only Collection Preview Step

**Files:**
- Modify: `src/pages/product-copy/ProductCopyPage.tsx`

- [ ] **Step 1: Add collection preview renderer**

Create a local render function or component:

```tsx
function renderCollectionPreview(listing: ProductCopyRecord): React.ReactNode {
  return (
    <Space vertical size={16} style={{ width: '100%' }}>
      <Descriptions size="small" bordered column={2} items={[
        { label: '商品 ID', children: listing.identity.itemId },
        { label: '平台', children: listing.identity.platform },
        { label: '店铺', children: listing.shop.name || '-' },
        { label: '原类目', children: sourceCategoryText(listing) },
        { label: '价格', children: listing.price.rangeText || '-' },
        { label: '销量', children: listing.sales.text || '-' },
        { label: '发货', children: listing.delivery.text || '-' },
        { label: '状态', children: statusTags(listing) },
      ]} />
      {/* Reuse the existing image, params, SKU and JSON sections from the old drawer. */}
    </Space>
  );
}
```

- [ ] **Step 2: Add collection preview actions**

At the bottom of this step render:

```tsx
<Space>
  <Button icon={<RobotOutlined />} loading={categoryOnlyMutation.isPending} onClick={() => categoryOnlyMutation.mutate()}>
    类目转换
  </Button>
  <Button type="primary" loading={generateDraftDataMutation.isPending} onClick={() => generateDraftDataMutation.mutate()}>
    下一步
  </Button>
</Space>
```

The `类目转换` button should only run `suggestWxCategoryFromFullList({ accountId, copyId })` and show its result in `draftSuggestion` / status text. It must not advance the main flow.

## Task 5: Generate and Preview Draft-Box Data

**Files:**
- Modify: `src/pages/product-copy/ProductCopyPage.tsx`

- [ ] **Step 1: Update generateDraftDataMutation**

Use the current account and fixed draft-box values:

```ts
const suggestion = await extensionApi.productCopy.suggestWxCategoryFromFullList({
  accountId,
  copyId: copyRecord.id,
});

const prepared = await extensionApi.productCopy.prepareWxDraft({
  accountId,
  copyId: copyRecord.id,
  catIds: suggestion.catIds,
  brandId: DEFAULT_BRAND_ID,
});

prepared.request.listing = DRAFT_BOX_LISTING_VALUE;
```

On success:

```ts
setDraftSuggestion(suggestion);
setDraftPrepared(prepared);
setDraftSubmittedResult(null);
setCurrentStep('draftPreview');
```

- [ ] **Step 2: Add draft preview renderer**

Render `draftPrepared.request` read-only:

```tsx
<Descriptions size="small" bordered column={2} items={[
  { label: '商品标题', children: request.title },
  { label: '外部商品 ID', children: request.out_product_id },
  { label: '品牌 ID', children: request.brand_id || '-' },
  { label: '微信类目 ID', children: request.cats_v2.map(cat => cat.cat_id).join(' / ') || '-' },
  { label: '创建位置', children: '草稿箱' },
  { label: '已上传图片', children: draftPrepared.uploadedImageCount },
]} />
```

Also show:

- head image grid from `request.head_imgs`
- detail image grid from `request.desc_info?.imgs`
- attrs table from `request.attrs`
- skus table from `request.skus`
- warning alert from `draftPrepared.warnings`
- collapsed final JSON request body

- [ ] **Step 3: Add draft preview actions**

Render:

```tsx
<Space>
  <Button onClick={() => setCurrentStep('collectionPreview')}>上一步</Button>
  <Button type="primary" loading={submitPreparedDraftMutation.isPending} onClick={() => submitPreparedDraftMutation.mutate()}>
    创建草稿
  </Button>
</Space>
```

## Task 6: Submit Draft Only and Complete the Flow

**Files:**
- Modify: `src/pages/product-copy/ProductCopyPage.tsx`

- [ ] **Step 1: Update submitPreparedDraftMutation**

Submit the prepared request as a draft-box product:

```ts
return extensionApi.productCopy.submitPreparedWxDraft({
  accountId: draftPrepared.accountId,
  copyId: draftPrepared.copyId,
  request: {
    ...draftPrepared.request,
    listing: DRAFT_BOX_LISTING_VALUE,
  },
  uploadedImageCount: draftPrepared.uploadedImageCount,
});
```

On success:

```ts
setDraftSubmittedResult(result);
setCurrentStep('completed');
message.success(`微信小店草稿已创建：${result.productId}`);
```

- [ ] **Step 2: Add completed step**

Render:

```tsx
<Alert
  type="success"
  showIcon
  title="微信小店草稿创建完成"
  description={`商品 ID：${draftSubmittedResult.productId}`}
/>
<Button type="primary" onClick={resetWizard}>继续复制商品</Button>
```

## Task 7: Verify

**Files:**
- Modify only if verification exposes issues.

- [ ] **Step 1: Run TypeScript compile**

Run:

```bash
npm run compile
```

Expected: PASS. If it fails because of pre-existing unrelated scheduler changes, inspect the errors and separate unrelated failures from product copy regressions.

- [ ] **Step 2: Start WXT dev server when needed**

Run:

```bash
npm run dev
```

Expected: WXT dev server starts and opens the Chrome development profile.

- [ ] **Step 3: Manual page verification**

In the WXT dashboard:

- 复制商品 displays the left account list.
- Clicking an account switches current account and resets the wizard.
- The main page starts with a product URL input.
- Successful collection moves to read-only collected data preview.
- `类目转换` does not advance the step.
- `下一步` generates draft data under the selected account.
- Draft preview does not show an account selector or submit-audit switch.
- `创建草稿` creates a draft-box product only.

- [ ] **Step 4: Commit only relevant files**

Commit only:

```bash
git add src/components/Layout.tsx src/pages/product-copy/ProductCopyPage.tsx docs/superpowers/plans/2026-06-05-product-copy-wizard.md
git commit -m "Refactor product copy into account wizard"
```

Do not stage existing scheduler-related workspace changes.
