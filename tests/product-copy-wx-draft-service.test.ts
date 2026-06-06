import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductCopyRecord } from '../src/shared/types.ts';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../src/shared/settings.ts';
import type { OpenAiCompatibleJsonCompletionInput } from '../src/background/ai/openai-compatible-client.ts';
import {
  createPreparedWxDraftBoxProduct,
  createWxDraftBoxProductFromCopyRecord,
  deleteCreatedWxDraftBoxProduct,
  prepareWxDraftBoxProductFromCopyRecord,
} from '../src/background/services/product-copy-wx-draft-service.ts';
import type {
  WxShopAddProductRequest,
  WxShopCategoryProductRule,
  WxShopListingClient,
  WxShopMerchantAddressDetail,
} from '../src/background/wxshop/listing/types.ts';
import type { WxDraftImageUploadSource } from '../src/background/services/product-copy-image-transfer-service.ts';
import { sampleProductCopyRecord } from './product-copy-fixtures.ts';

function sampleListing(): ProductCopyRecord {
  return sampleProductCopyRecord({
    images: {
      ...sampleProductCopyRecord().images,
      detail: ['https://img.alicdn.com/main-1.jpg', 'https://img.alicdn.com/detail-1.jpg'],
    },
    detail: {
      text: '',
      source: 'detailDom',
      images: ['https://img.alicdn.com/main-1.jpg', 'https://img.alicdn.com/detail-1.jpg'],
    },
    params: [{ name: '品牌', value: '灿冕', group: 'basic' }],
    sku: {
      ...sampleProductCopyRecord().sku,
      groups: [],
      matrix: [sampleProductCopyRecord().sku.matrix[0]],
    },
  });
}

async function emptyCachedCategoryProductRule(catId: string): Promise<WxShopCategoryProductRule> {
  return { catId, productAttrs: [], saleAttrs: [] };
}

function aiSettings(): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    aiService: {
      baseUrl: 'https://llm.example.test/v1',
      apiKey: 'sk-test',
      model: 'gpt-compatible',
    },
  };
}

async function fakeDownloadImage(source: WxDraftImageUploadSource) {
  return {
    sourceUrl: source.sourceUrl,
    fetchedUrl: source.candidates[0],
    filename: 'dianxiaoqi-test-image.jpg',
    mimeType: 'image/jpeg',
    data: new Uint8Array([1, 2, 3]).buffer,
  };
}

interface FakeListingClientOptions {
  freightTemplateIds?: string[];
  addressIds?: string[];
  addressDetails?: Record<string, Partial<WxShopMerchantAddressDetail>>;
  deletedProductIds?: string[];
}

function fakeListingClient(
  uploaded: string[],
  addRequests: WxShopAddProductRequest[],
  options: FakeListingClientOptions = {},
): WxShopListingClient {
  return {
    async getDraftProducts() {
      return { productIds: [], nextKey: '', hasMore: false };
    },
    async getProductDetail() {
      throw new Error('not used');
    },
    async getProductQrcode() {
      throw new Error('not used');
    },
    async getAllCategoryPaths() {
      return [];
    },
    async precheckProductCategory(catId: string) {
      return { catId, allPass: true, failReasons: [] };
    },
    async getCategoryProductRule(catId: string) {
      return { catId, productAttrs: [], saleAttrs: [] };
    },
    async getFreightTemplates() {
      return (options.freightTemplateIds ?? ['47428464001']).map(templateId => ({ templateId }));
    },
    async getFreightTemplateIds() {
      return options.freightTemplateIds ?? ['47428464001'];
    },
    async getMerchantAddressIds() {
      return options.addressIds ?? ['111111', '123456'];
    },
    async getMerchantAddressDetail(addressId: string) {
      const override = options.addressDetails?.[addressId] || {};
      return {
        addressId,
        defaultSend: false,
        defaultRecv: addressId === '123456',
        sendAddr: false,
        recvAddr: true,
        ...override,
      };
    },
    async uploadImageByUrl(imgUrl: string) {
      uploaded.push(imgUrl);
      return { imgUrl: `https://mmecimage.cn/p/${uploaded.length}.jpg` };
    },
    async addProduct(input: WxShopAddProductRequest) {
      addRequests.push(input);
      return { productId: '987654321', createTime: '2026-06-01 12:00:00' };
    },
    async submitProductAudit() {
      return { errcode: 0, errmsg: 'ok' };
    },
    async getAuditQuota() {
      return { quota: 0, total: 0 };
    },
    async deleteProduct(productId: string) {
      options.deletedProductIds?.push(productId);
      return { errcode: 0, errmsg: 'ok' };
    },
  };
}

function fakeFailingUploadClient(uploaded: string[], addRequests: WxShopAddProductRequest[], failAt: number): WxShopListingClient {
  const client = fakeListingClient(uploaded, addRequests);
  return {
    ...client,
    async uploadImageByUrl(imgUrl: string) {
      uploaded.push(imgUrl);
      if (uploaded.length === failAt) throw new Error('图片服务拒绝上传');
      return { imgUrl: `https://mmecimage.cn/p/${uploaded.length}.jpg` };
    },
  };
}

function fakeBlockedCategoryClient(uploaded: string[], addRequests: WxShopAddProductRequest[]): WxShopListingClient {
  const client = fakeListingClient(uploaded, addRequests);
  return {
    ...client,
    async precheckProductCategory(catId: string) {
      return {
        catId,
        allPass: false,
        failReasons: ['无该类目权限，请申请类目后再发品', '保证金余额不足类目保证金应缴，无法上架商品'],
      };
    },
  };
}

test('creates a WeChat draft-box product from a product copy record using uploaded WeChat images', async () => {
  const uploaded: string[] = [];
  const addRequests: WxShopAddProductRequest[] = [];
  const createdRecords: string[] = [];

  const result = await createWxDraftBoxProductFromCopyRecord({
    accountId: 'account-1',
    copyId: 'taobao:1010211244888',
    catIds: ['10000111', '10000113', '6091'],
  }, {
    getCopyRecord: async () => sampleListing(),
    getClient: async () => fakeListingClient(uploaded, addRequests),
    downloadImage: fakeDownloadImage,
    getCategoryProductRule: emptyCachedCategoryProductRule,
    recordStarted: async () => {},
    recordCompleted: async () => {},
    recordFailed: async () => {},
    recordCreatedProduct: async result => { createdRecords.push(result.productId); },
  });

  assert.deepEqual(uploaded, [
    'https://img.alicdn.com/main-1.jpg',
    'https://img.alicdn.com/main-2.jpg',
    'https://img.alicdn.com/main-3.jpg',
    'https://img.alicdn.com/detail-1.jpg',
    'https://img.alicdn.com/white.jpg',
  ]);
  assert.equal(addRequests.length, 1);
  assert.equal(addRequests[0].listing, 0);
  assert.equal(addRequests[0].head_imgs[0], 'https://mmecimage.cn/p/1.jpg');
  assert.equal(addRequests[0].desc_info?.imgs?.[0], 'https://mmecimage.cn/p/4.jpg');
  assert.equal(addRequests[0].skus[0].thumb_img, 'https://mmecimage.cn/p/5.jpg');
  assert.deepEqual(addRequests[0].express_info, { template_id: '47428464001' });
  assert.deepEqual(addRequests[0].after_sale_info, { after_sale_address_id: 123456 });
  assert.deepEqual(result, {
    accountId: 'account-1',
    copyId: 'taobao:1010211244888',
    productId: '987654321',
    createTime: '2026-06-01 12:00:00',
    listing: 0,
    uploadedImageCount: 5,
  });
  assert.deepEqual(createdRecords, ['987654321']);
});

test('prepares a WeChat draft-box product without submitting it to the add-product API', async () => {
  const uploaded: string[] = [];
  const addRequests: WxShopAddProductRequest[] = [];
  const startedLogs: Record<string, unknown>[] = [];
  const completedLogs: Record<string, unknown>[] = [];
  const failedLogs: Record<string, unknown>[] = [];

  const prepared = await prepareWxDraftBoxProductFromCopyRecord({
    accountId: 'account-1',
    copyId: 'taobao:1010211244888',
    catIds: ['10000111', '10000113', '6091'],
    attrs: [{ attrKey: '型号', attrValue: 'KPW-1' }],
  }, {
    getCopyRecord: async () => sampleListing(),
    getClient: async () => fakeListingClient(uploaded, addRequests),
    downloadImage: fakeDownloadImage,
    getCategoryProductRule: emptyCachedCategoryProductRule,
    recordStarted: async input => { startedLogs.push(input); },
    recordCompleted: async input => { completedLogs.push(input); },
    recordFailed: async input => { failedLogs.push(input); },
  });

  assert.deepEqual(uploaded, [
    'https://img.alicdn.com/main-1.jpg',
    'https://img.alicdn.com/main-2.jpg',
    'https://img.alicdn.com/main-3.jpg',
    'https://img.alicdn.com/detail-1.jpg',
    'https://img.alicdn.com/white.jpg',
  ]);
  assert.equal(addRequests.length, 0);
  assert.equal(prepared.accountId, 'account-1');
  assert.equal(prepared.copyId, 'taobao:1010211244888');
  assert.equal(prepared.uploadedImageCount, 5);
  assert.equal(prepared.request.title, sampleListing().title);
  assert.equal(prepared.request.head_imgs[0], 'https://mmecimage.cn/p/1.jpg');
  assert.equal(prepared.request.attrs, undefined);
  assert.deepEqual(prepared.request.express_info, { template_id: '47428464001' });
  assert.deepEqual(prepared.request.after_sale_info, { after_sale_address_id: 123456 });
  assert.deepEqual(prepared.warnings, []);
  assert.deepEqual(prepared.summary, {
    title: sampleListing().title,
    headImageCount: 3,
    detailImageCount: 1,
    skuCount: 1,
    attrCount: 0,
    listing: false,
  });
  assert.equal(startedLogs.length, 1);
  assert.equal(completedLogs.length, 1);
  assert.equal(failedLogs.length, 0);
  assert.equal(startedLogs[0].title, '微信小店草稿数据生成开始');
  assert.equal(completedLogs[0].title, '微信小店草稿数据生成完成');
  assert.deepEqual(completedLogs[0].summary, { uploadedImages: 5 });
});

test('records a failed prepare log with the failed image index when image upload fails', async () => {
  const uploaded: string[] = [];
  const addRequests: WxShopAddProductRequest[] = [];
  const failedLogs: Record<string, unknown>[] = [];

  await assert.rejects(
    () => prepareWxDraftBoxProductFromCopyRecord({
      accountId: 'account-1',
      copyId: 'taobao:1010211244888',
      catIds: ['10000111', '10000113', '6091'],
    }, {
      getCopyRecord: async () => sampleListing(),
      getClient: async () => fakeFailingUploadClient(uploaded, addRequests, 2),
      downloadImage: fakeDownloadImage,
      getCategoryProductRule: emptyCachedCategoryProductRule,
      recordStarted: async () => {},
      recordCompleted: async () => {},
      recordFailed: async input => { failedLogs.push(input); },
    }),
    /第 2\/5 张商品图片上传失败：图片服务拒绝上传/,
  );

  assert.equal(addRequests.length, 0);
  assert.equal(failedLogs.length, 1);
  assert.equal(failedLogs[0].title, '微信小店草稿数据生成失败');
  assert.deepEqual(failedLogs[0].error, { message: '第 2/5 张商品图片上传失败：图片服务拒绝上传' });
});

test('prepares preview data without running the WeChat category precheck', async () => {
  const uploaded: string[] = [];
  const addRequests: WxShopAddProductRequest[] = [];
  const failedLogs: Record<string, unknown>[] = [];

  const prepared = await prepareWxDraftBoxProductFromCopyRecord({
    accountId: 'account-1',
    copyId: 'taobao:1010211244888',
    catIds: ['10000111', '10000113', '6091'],
  }, {
    getCopyRecord: async () => sampleListing(),
    getClient: async () => fakeBlockedCategoryClient(uploaded, addRequests),
    downloadImage: fakeDownloadImage,
    getCategoryProductRule: emptyCachedCategoryProductRule,
    recordStarted: async () => {},
    recordCompleted: async () => {},
    recordFailed: async input => { failedLogs.push(input); },
  });

  assert.equal(prepared.request.cats_v2.at(-1)?.cat_id, '6091');
  assert.equal(prepared.uploadedImageCount, 5);
  assert.equal(uploaded.length, 5);
  assert.deepEqual(addRequests, []);
  assert.equal(failedLogs.length, 0);
});

test('stops before image upload when the local WeChat category product rule cache is missing', async () => {
  const uploaded: string[] = [];
  const addRequests: WxShopAddProductRequest[] = [];
  const failedLogs: Record<string, unknown>[] = [];

  await assert.rejects(
    () => prepareWxDraftBoxProductFromCopyRecord({
      accountId: 'account-1',
      copyId: 'taobao:1010211244888',
      catIds: ['10000111', '10000113', '6091'],
    }, {
      getCopyRecord: async () => sampleListing(),
      getClient: async () => fakeListingClient(uploaded, addRequests),
      downloadImage: fakeDownloadImage,
      getCategoryProductRule: async () => null,
      recordStarted: async () => {},
      recordCompleted: async () => {},
      recordFailed: async input => { failedLogs.push(input); },
    }),
    /微信小店类目 6091 的发品规则未缓存，请先在设置的基础数据中下载云端类目数据/,
  );

  assert.deepEqual(uploaded, []);
  assert.deepEqual(addRequests, []);
  assert.equal(failedLogs.length, 1);
  assert.deepEqual(failedLogs[0].error, {
    message: '微信小店类目 6091 的发品规则未缓存，请先在设置的基础数据中下载云端类目数据',
  });
});

test('fills required product attributes with AI and local WeChat category rules before image upload', async () => {
  const uploaded: string[] = [];
  const addRequests: WxShopAddProductRequest[] = [];
  const client = fakeListingClient(uploaded, addRequests);
  const aiCalls: OpenAiCompatibleJsonCompletionInput[] = [];

  const prepared = await prepareWxDraftBoxProductFromCopyRecord({
    accountId: 'account-1',
    copyId: 'taobao:1010211244888',
    catIds: ['10000111', '10000113', '6091'],
  }, {
    getCopyRecord: async () => sampleListing(),
    getClient: async () => client,
    downloadImage: fakeDownloadImage,
    getCategoryProductRule: async catId => ({
      catId,
      productAttrs: [
        { name: '腕托', type: 'string', values: [], required: true, appendAllowed: false },
        { name: '产品净重', type: 'string', values: [], required: true, appendAllowed: false },
        { name: '尺寸', type: 'string', values: [], required: true, appendAllowed: false },
        { name: '产地', type: 'select_one', values: ['中国大陆', '中国澳门', '中国台湾', '中国香港', '国外'], required: true, appendAllowed: false },
        { name: '颜色', type: 'string', values: [], required: true, appendAllowed: false },
        { name: '材质', type: 'select_one', values: ['皮质', '橡胶', '树脂垫', '金属', '其他', '布'], required: true, appendAllowed: false },
        { name: '类型', type: 'select_one', values: ['大垫', '小垫', '桌垫'], required: true, appendAllowed: false },
        { name: '数量', type: 'integer_unit', values: ['只', '个'], required: true, appendAllowed: false },
      ],
      saleAttrs: [],
    }),
    getSettings: async () => aiSettings(),
    completeJson: async input => {
      aiCalls.push(input);
      return {
        attrs: [
          { attrKey: '腕托', attrValue: '无' },
          { attrKey: '产品净重', attrValue: '0.1kg' },
          { attrKey: '尺寸', attrValue: '1m' },
          { attrKey: '产地', attrValue: '中国大陆' },
          { attrKey: '颜色', attrValue: '白色' },
          { attrKey: '材质', attrValue: '其他' },
          { attrKey: '类型', attrValue: '大垫' },
          { attrKey: '数量', attrValue: '10只' },
        ],
        warnings: ['腕托和产品净重为 AI 推断值，请复核。'],
      };
    },
    recordStarted: async () => {},
    recordCompleted: async () => {},
    recordFailed: async () => {},
  });

  assert.equal(aiCalls.length, 1);
  const aiPrompt = JSON.parse(aiCalls[0].messages[1].content) as {
    categoryRule: { requiredProductAttrs: Array<{ name: string }> };
  };
  assert.deepEqual(aiPrompt.categoryRule.requiredProductAttrs.map(attr => attr.name), [
    '腕托',
    '产品净重',
    '尺寸',
    '产地',
    '颜色',
    '材质',
    '类型',
    '数量',
  ]);
  const attrs = new Map(prepared.request.attrs?.map(attr => [attr.attr_key, attr.attr_value]) || []);
  assert.equal(attrs.get('腕托'), '无');
  assert.equal(attrs.get('产品净重'), '0.1kg');
  assert.equal(attrs.get('尺寸'), '1m');
  assert.equal(attrs.get('产地'), '中国大陆');
  assert.equal(attrs.get('材质'), '其他');
  assert.equal(attrs.get('类型'), '大垫');
  assert.equal(attrs.get('颜色'), '白色');
  assert.equal(attrs.get('数量'), '10只');
  assert.equal(prepared.summary.attrCount, 8);
  assert.equal(prepared.warnings.some(warning => warning.includes('腕托和产品净重')), true);
  assert.equal(prepared.warnings.some(warning => warning.includes('AI 已按微信类目规则补齐 8/8 个必填商品参数')), true);
});

test('rejects AI product attributes that do not satisfy local enum rules before image upload', async () => {
  const uploaded: string[] = [];
  const addRequests: WxShopAddProductRequest[] = [];

  await assert.rejects(
    () => prepareWxDraftBoxProductFromCopyRecord({
      accountId: 'account-1',
      copyId: 'taobao:1010211244888',
      catIds: ['10000111', '10000113', '6091'],
    }, {
      getCopyRecord: async () => sampleListing(),
      getClient: async () => fakeListingClient(uploaded, addRequests),
      downloadImage: fakeDownloadImage,
      getCategoryProductRule: async catId => ({
        catId,
        productAttrs: [
          { name: '材质', type: 'select_one', values: ['皮质', '橡胶', '树脂垫', '金属', '其他', '布'], required: true, appendAllowed: false },
        ],
        saleAttrs: [],
      }),
      getSettings: async () => aiSettings(),
      completeJson: async () => ({
        attrs: [{ attrKey: '材质', attrValue: '玻璃' }],
        warnings: [],
      }),
      recordStarted: async () => {},
      recordCompleted: async () => {},
      recordFailed: async () => {},
    }),
    /商品参数「材质」值「玻璃」不在微信允许值内，期望值为：皮质；橡胶；树脂垫；金属；其他；布/,
  );

  assert.deepEqual(uploaded, []);
  assert.deepEqual(addRequests, []);
});

test('creates a prepared WeChat draft-box product without re-uploading images', async () => {
  const uploaded: string[] = [];
  const addRequests: WxShopAddProductRequest[] = [];
  const createdRecords: string[] = [];
  const sourceBindings: Array<{ productId: string; sourceTitle?: string }> = [];
  const prepared = await prepareWxDraftBoxProductFromCopyRecord({
    accountId: 'account-1',
    copyId: 'taobao:1010211244888',
    catIds: ['10000111', '10000113', '6091'],
  }, {
    getCopyRecord: async () => sampleListing(),
    getClient: async () => fakeListingClient(uploaded, addRequests),
    downloadImage: fakeDownloadImage,
    getCategoryProductRule: emptyCachedCategoryProductRule,
    recordStarted: async () => {},
    recordCompleted: async () => {},
    recordFailed: async () => {},
  });
  uploaded.length = 0;

  const result = await createPreparedWxDraftBoxProduct({
    accountId: 'account-1',
    copyId: 'taobao:1010211244888',
    request: prepared.request,
    uploadedImageCount: prepared.uploadedImageCount,
    autoSourceBinding: true,
  }, {
    getCopyRecord: async () => sampleListing(),
    getClient: async () => fakeListingClient(uploaded, addRequests),
    recordStarted: async () => {},
    recordCompleted: async () => {},
    recordFailed: async () => {},
    recordCreatedProduct: async result => { createdRecords.push(result.productId); },
    recordProductSource: async (result, source) => {
      sourceBindings.push({ productId: result.productId, sourceTitle: source?.title });
    },
  });

  assert.deepEqual(uploaded, []);
  assert.equal(addRequests.length, 1);
  assert.equal(addRequests[0], prepared.request);
  assert.deepEqual(result, {
    accountId: 'account-1',
    copyId: 'taobao:1010211244888',
    productId: '987654321',
    createTime: '2026-06-01 12:00:00',
    listing: 0,
    uploadedImageCount: 5,
  });
  assert.deepEqual(createdRecords, ['987654321']);
  assert.deepEqual(sourceBindings, [{ productId: '987654321', sourceTitle: sampleListing().title }]);
});

test('skips the WeChat category precheck when creating a draft-box product', async () => {
  const uploaded: string[] = [];
  const addRequests: WxShopAddProductRequest[] = [];
  const failedLogs: Record<string, unknown>[] = [];
  const prepared = await prepareWxDraftBoxProductFromCopyRecord({
    accountId: 'account-1',
    copyId: 'taobao:1010211244888',
    catIds: ['10000111', '10000113', '6091'],
  }, {
    getCopyRecord: async () => sampleListing(),
    getClient: async () => fakeListingClient(uploaded, addRequests),
    downloadImage: fakeDownloadImage,
    getCategoryProductRule: emptyCachedCategoryProductRule,
    recordStarted: async () => {},
    recordCompleted: async () => {},
    recordFailed: async () => {},
  });
  uploaded.length = 0;

  const result = await createPreparedWxDraftBoxProduct({
    accountId: 'account-1',
    copyId: 'taobao:1010211244888',
    request: prepared.request,
    uploadedImageCount: prepared.uploadedImageCount,
  }, {
    getClient: async () => fakeBlockedCategoryClient(uploaded, addRequests),
    recordStarted: async () => {},
    recordCompleted: async () => {},
    recordFailed: async input => { failedLogs.push(input); },
    recordCreatedProduct: async () => {},
  });

  assert.deepEqual(uploaded, []);
  assert.equal(addRequests.length, 1);
  assert.equal(addRequests[0].listing, 0);
  assert.equal(failedLogs.length, 0);
  assert.equal(result.productId, '987654321');
  assert.equal(result.listing, 0);
});

test('deletes the draft-box product created by the product copy test flow', async () => {
  const deletedProductIds: string[] = [];
  const removedCreatedRecords: string[] = [];
  const removedSourceBindings: string[] = [];
  const completedLogs: Record<string, unknown>[] = [];

  const result = await deleteCreatedWxDraftBoxProduct({
    accountId: 'account-1',
    copyId: 'taobao:1010211244888',
    productId: '987654321',
    productTitle: '测试商品',
  }, {
    getClient: async () => fakeListingClient([], [], { deletedProductIds }),
    recordStarted: async () => {},
    recordCompleted: async input => { completedLogs.push(input); },
    recordFailed: async () => {},
    removeCreatedProduct: async (_accountId, copyId) => { removedCreatedRecords.push(copyId); },
    removeProductSourceBinding: async (_accountId, productId) => { removedSourceBindings.push(productId); },
  });

  assert.deepEqual(deletedProductIds, ['987654321']);
  assert.deepEqual(result, {
    accountId: 'account-1',
    copyId: 'taobao:1010211244888',
    productId: '987654321',
    deleted: true,
  });
  assert.deepEqual(removedCreatedRecords, ['taobao:1010211244888']);
  assert.deepEqual(removedSourceBindings, ['987654321']);
  assert.equal(completedLogs.length, 1);
  assert.equal((completedLogs[0].metadata as Record<string, unknown>).submitMode, 'draftBoxCleanup');
});

test('fails before calling WeChat when the product copy record no longer exists', async () => {
  let clientRequested = false;

  await assert.rejects(
    () => createWxDraftBoxProductFromCopyRecord({
      accountId: 'account-1',
      copyId: 'missing',
      catIds: ['10000111', '10000113', '6091'],
    }, {
      getCopyRecord: async () => null,
      downloadImage: fakeDownloadImage,
      getClient: async () => {
        clientRequested = true;
        return fakeListingClient([], []);
      },
      recordStarted: async () => {},
      recordCompleted: async () => {},
      recordFailed: async () => {},
    }),
    /采集商品不存在或已删除/,
  );

  assert.equal(clientRequested, false);
});
