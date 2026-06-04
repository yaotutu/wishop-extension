import type {
  CollectedProductListing,
  CreateWxProductDraftPrepareInput,
  CreateWxProductDraftInput,
  SubmitPreparedWxProductDraftInput,
  WxProductDraftCreationResult,
  WxProductDraftPrepareResult,
} from '../../shared/types.ts';
import type { AppSettings } from '../../shared/settings.ts';
import type { SiliconFlowJsonCompletionInput } from '../ai/siliconflow-client.ts';
import type { WxShopCategoryProductRule, WxShopListingClient } from '../wxshop/listing/types.ts';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';
import {
  collectWxDraftSourceImages,
  mapCollectedListingToWxAddProductRequest,
} from './product-listing-wx-draft-mapper.ts';
import { generateRuleDrivenWxProductAttributes } from './product-listing-wx-attribute-ai-service.ts';
import { getCachedWxCategoryProductRule } from './wx-category-product-rule-cache-service.ts';

type ActivityRecorder = (input: Record<string, unknown>) => Promise<unknown>;
type CompleteJson = (input: SiliconFlowJsonCompletionInput) => Promise<unknown>;

const DEFAULT_DRAFT_STOCK_NUM = 999;

export interface CreateWxProductDraftDependencies {
  getListing?: (listingId: string) => Promise<CollectedProductListing | null>;
  getClient?: (accountId: string) => Promise<WxShopListingClient>;
  getCategoryProductRule?: (catId: string) => Promise<WxShopCategoryProductRule | null>;
  getSettings?: () => Promise<AppSettings>;
  completeJson?: CompleteJson;
  recordStarted?: ActivityRecorder;
  recordCompleted?: ActivityRecorder;
  recordFailed?: ActivityRecorder;
}

function createRunId(input: { accountId: string; listingId: string }): string {
  return `createWxDraft:${input.accountId}:${input.listingId}:${Date.now()}`;
}

function createPrepareRunId(input: { accountId: string; listingId: string }): string {
  return `prepareWxDraft:${input.accountId}:${input.listingId}:${Date.now()}`;
}

function validateInput(input: { accountId: string; listingId: string }): void {
  if (!input.accountId.trim()) throw new Error('缺少微信小店账号 ID');
  if (!input.listingId.trim()) throw new Error('缺少本地采集商品 ID');
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function leafCategoryId(catIds: string[]): string {
  return catIds.at(-1)?.trim() || '';
}

async function assertWxProductCategoryPrecheck(
  input: CreateWxProductDraftPrepareInput,
  client: WxShopListingClient,
  logger = createDiagnosticLogger({ domain: 'listing', component: 'WxDraftPrepare' }),
): Promise<void> {
  const catId = leafCategoryId(input.catIds);
  if (!catId) throw new Error('缺少微信小店叶子类目 ID，无法执行发品前校验');

  logger.info('开始执行微信小店发品前类目校验', { catId });
  const precheck = await client.precheckProductCategory(catId);
  if (precheck.allPass) {
    logger.info('微信小店发品前类目校验通过', { catId });
    return;
  }

  const reasons = precheck.failReasons.length > 0 ? precheck.failReasons.join('；') : '微信小店未返回具体原因';
  logger.warn('微信小店发品前类目校验未通过', { catId, reasons });
  throw new Error(`微信小店类目发品前校验未通过：${reasons}`);
}

async function resolveExpressTemplateId(
  input: CreateWxProductDraftPrepareInput,
  client: WxShopListingClient,
  logger = createDiagnosticLogger({ domain: 'listing', component: 'WxDraftPrepare' }),
): Promise<string> {
  const manualTemplateId = input.expressTemplateId?.trim();
  if (manualTemplateId) return manualTemplateId;

  logger.info('开始读取微信小店默认运费模板');
  const templateIds = await client.getFreightTemplateIds();
  const templateId = templateIds[0]?.trim();
  if (!templateId) throw new Error('微信小店没有可用运费模板，请先在微信小店后台配置默认运费模板');
  logger.info('已选择微信小店运费模板', { templateId });
  return templateId;
}

async function resolveAfterSaleAddressId(
  input: CreateWxProductDraftPrepareInput,
  client: WxShopListingClient,
  logger = createDiagnosticLogger({ domain: 'listing', component: 'WxDraftPrepare' }),
): Promise<string> {
  const manualAddressId = input.afterSaleAddressId?.trim();
  if (manualAddressId) return manualAddressId;

  logger.info('开始读取微信小店默认售后地址');
  const addressIds = await client.getMerchantAddressIds();
  if (addressIds.length === 0) throw new Error('微信小店没有可用售后地址，请先在微信小店后台配置默认售后地址');

  const addressDetails = [];
  for (const addressId of addressIds) {
    try {
      addressDetails.push(await client.getMerchantAddressDetail(addressId));
    } catch (error) {
      logger.warn('读取微信小店地址详情失败，继续尝试其它地址', {
        addressId,
        error: errorMessage(error, '地址详情读取失败'),
      });
    }
  }

  const selected = addressDetails.find(detail => detail.defaultRecv)
    || addressDetails.find(detail => detail.recvAddr)
    || addressDetails.find(detail => detail.defaultSend)
    || addressDetails[0];
  const addressId = selected?.addressId || addressIds[0];
  logger.info('已选择微信小店售后地址', { addressId });
  return addressId;
}

async function resolveWxDraftSystemDefaults(
  input: CreateWxProductDraftPrepareInput,
  client: WxShopListingClient,
  logger = createDiagnosticLogger({ domain: 'listing', component: 'WxDraftPrepare' }),
): Promise<{ expressTemplateId: string; afterSaleAddressId: string; defaultStockNum: number }> {
  const [expressTemplateId, afterSaleAddressId] = await Promise.all([
    resolveExpressTemplateId(input, client, logger),
    resolveAfterSaleAddressId(input, client, logger),
  ]);
  return {
    expressTemplateId,
    afterSaleAddressId,
    defaultStockNum: input.defaultStockNum ?? DEFAULT_DRAFT_STOCK_NUM,
  };
}

async function uploadListingImages(
  listing: CollectedProductListing,
  client: WxShopListingClient,
  logger = createDiagnosticLogger({ domain: 'listing', component: 'WxDraftPrepare' }),
): Promise<Map<string, string>> {
  const uploadedImages = new Map<string, string>();
  const sourceImages = collectWxDraftSourceImages(listing);
  logger.info('开始上传微信小店商品图片', {
    listingId: listing.id,
    imageCount: sourceImages.length,
  });

  for (const [index, imageUrl] of sourceImages.entries()) {
    try {
      const uploaded = await client.uploadImageByUrl(imageUrl);
      uploadedImages.set(imageUrl, uploaded.imgUrl);
      logger.info('商品图片上传完成', {
        listingId: listing.id,
        imageIndex: index + 1,
        imageCount: sourceImages.length,
      });
    } catch (error) {
      const message = errorMessage(error, '微信小店图片上传失败');
      logger.error('商品图片上传失败', {
        listingId: listing.id,
        imageIndex: index + 1,
        imageCount: sourceImages.length,
        error: message,
      });
      throw new Error(`第 ${index + 1}/${sourceImages.length} 张商品图片上传失败：${message}`);
    }
  }
  return uploadedImages;
}

async function defaultGetListing(listingId: string): Promise<CollectedProductListing | null> {
  const repository = await import('../store/collected-product-listing-repository.ts');
  return repository.getCollectedProductListing(listingId);
}

async function defaultGetClient(accountId: string): Promise<WxShopListingClient> {
  const registry = await import('../wxshop/client-registry.ts');
  return registry.getListingClient(accountId);
}

async function defaultGetCategoryProductRule(catId: string): Promise<WxShopCategoryProductRule | null> {
  return getCachedWxCategoryProductRule(catId);
}

async function defaultRecordStarted(input: Record<string, unknown>): Promise<unknown> {
  const activityLog = await import('../activity-logs/activity-log-service.ts');
  return activityLog.recordActivityStarted(input as never);
}

async function defaultRecordCompleted(input: Record<string, unknown>): Promise<unknown> {
  const activityLog = await import('../activity-logs/activity-log-service.ts');
  return activityLog.recordActivityCompleted(input as never);
}

async function defaultRecordFailed(input: Record<string, unknown>): Promise<unknown> {
  const activityLog = await import('../activity-logs/activity-log-service.ts');
  return activityLog.recordActivityFailed(input as never);
}

function summarizePreparedRequest(
  input: CreateWxProductDraftPrepareInput,
  uploadedImageCount: number,
  request: WxProductDraftPrepareResult['request'],
  warnings: string[],
): WxProductDraftPrepareResult {
  return {
    accountId: input.accountId,
    listingId: input.listingId,
    request,
    uploadedImageCount,
    preparedAt: Date.now(),
    warnings,
    summary: {
      title: request.title,
      headImageCount: request.head_imgs.length,
      detailImageCount: request.desc_info?.imgs?.length || 0,
      skuCount: request.skus.length,
      attrCount: request.attrs?.length || 0,
      listing: request.listing === 1,
    },
  };
}

async function resolveWxDraftProductAttributes(
  input: CreateWxProductDraftPrepareInput,
  listing: CollectedProductListing,
  dependencies: Pick<CreateWxProductDraftDependencies, 'getCategoryProductRule' | 'getSettings' | 'completeJson'>,
  logger = createDiagnosticLogger({ domain: 'listing', component: 'WxDraftPrepare' }),
): Promise<{
  attrs: CreateWxProductDraftPrepareInput['attrs'];
  warnings: string[];
}> {
  const catId = leafCategoryId(input.catIds);
  if (!catId) throw new Error('缺少微信小店叶子类目 ID，无法读取类目发品规则');

  logger.info('开始读取本地微信小店类目发品规则缓存', { catId });
  const loadCategoryRule = dependencies.getCategoryProductRule || defaultGetCategoryProductRule;
  const categoryRule = await loadCategoryRule(catId);
  if (!categoryRule) {
    throw new Error(`微信小店类目 ${catId} 的发品规则未缓存，请先在设置的基础数据中下载云端类目数据`);
  }
  logger.info('开始按本地微信类目规则处理商品参数', {
    catId,
    requiredAttrCount: categoryRule.productAttrs.filter(rule => rule.required).length,
  });
  const result = await generateRuleDrivenWxProductAttributes({
    listingId: input.listingId,
    listing,
    categoryRule,
    providedAttrs: input.attrs,
  }, {
    getSettings: dependencies.getSettings,
    completeJson: dependencies.completeJson,
  });
  logger.info('微信小店类目属性 AI 补齐完成', {
    catId,
    productRuleCount: categoryRule.productAttrs.length,
    requiredAttrCount: result.requiredAttrCount,
    outputAttrCount: result.attrs.length,
    aiAttrCount: result.aiAttrCount,
    warningCount: result.warnings.length,
  });
  result.warnings.forEach(warning => logger.warn('微信小店商品参数已由 AI 按类目规则补齐', { warning }));
  return {
    attrs: result.attrs,
    warnings: result.warnings,
  };
}

export async function prepareWxProductDraftFromCollectedListing(
  input: CreateWxProductDraftPrepareInput,
  dependencies: CreateWxProductDraftDependencies = {},
): Promise<WxProductDraftPrepareResult> {
  validateInput(input);
  const runId = createPrepareRunId(input);
  const logger = createDiagnosticLogger({
    domain: 'listing',
    component: 'WxDraftPrepare',
    accountId: input.accountId,
  });
  const recordStarted = dependencies.recordStarted || defaultRecordStarted;
  const recordCompleted = dependencies.recordCompleted || defaultRecordCompleted;
  const recordFailed = dependencies.recordFailed || defaultRecordFailed;
  const activityBase = {
    domain: 'listing' as const,
    scope: 'account' as const,
    accountId: input.accountId,
    trigger: 'manual' as const,
    runId,
    metadata: {
      listingId: input.listingId,
      catIds: input.catIds.join('/'),
      autoListing: Boolean(input.autoListing),
    },
  };

  await recordStarted({
    ...activityBase,
    title: '微信小店上架数据生成开始',
    detail: `采集商品：${input.listingId}`,
  });

  try {
    logger.info('开始读取本地采集商品', { listingId: input.listingId });
    const loadListing = dependencies.getListing || defaultGetListing;
    const listing = await loadListing(input.listingId);
    if (!listing) throw new Error('采集商品不存在或已删除');

    logger.info('开始创建微信小店 client', { listingId: input.listingId });
    const getClient = dependencies.getClient || defaultGetClient;
    const client = await getClient(input.accountId);
    await assertWxProductCategoryPrecheck(input, client, logger);
    const attrResult = await resolveWxDraftProductAttributes(input, listing, dependencies, logger);
    const defaults = await resolveWxDraftSystemDefaults(input, client, logger);
    const uploadedImages = await uploadListingImages(listing, client, logger);
    logger.info('开始生成微信小店新增商品请求体', {
      listingId: input.listingId,
      uploadedImageCount: uploadedImages.size,
      skuCount: listing.sku.matrix.length,
      attrCount: attrResult.attrs?.length ?? listing.params.length,
      defaultStockNum: defaults.defaultStockNum,
    });
    const addProductRequest = mapCollectedListingToWxAddProductRequest(listing, {
      catIds: input.catIds,
      expressTemplateId: defaults.expressTemplateId,
      afterSaleAddressId: defaults.afterSaleAddressId,
      brandId: input.brandId,
      defaultStockNum: defaults.defaultStockNum,
      autoListing: input.autoListing,
      attrs: attrResult.attrs,
      uploadedImages,
    });
    const prepared = summarizePreparedRequest(input, uploadedImages.size, addProductRequest, attrResult.warnings);

    await recordCompleted({
      ...activityBase,
      title: '微信小店上架数据生成完成',
      detail: addProductRequest.title,
      summary: {
        uploadedImages: uploadedImages.size,
      },
      metadata: {
        ...activityBase.metadata,
        headImageCount: prepared.summary.headImageCount,
        detailImageCount: prepared.summary.detailImageCount,
        skuCount: prepared.summary.skuCount,
        attrCount: prepared.summary.attrCount,
        warningCount: prepared.warnings.length,
      },
    });
    return prepared;
  } catch (error) {
    const message = errorMessage(error, '微信小店上架数据生成失败');
    logger.error('微信小店上架数据生成失败', {
      listingId: input.listingId,
      error: message,
    });
    await recordFailed({
      ...activityBase,
      title: '微信小店上架数据生成失败',
      detail: `采集商品：${input.listingId}`,
      error: { message },
    });
    throw error;
  }
}

export async function submitPreparedWxProductDraft(
  input: SubmitPreparedWxProductDraftInput,
  dependencies: CreateWxProductDraftDependencies = {},
): Promise<WxProductDraftCreationResult> {
  validateInput(input);

  const runId = createRunId(input);
  const recordStarted = dependencies.recordStarted || defaultRecordStarted;
  const recordCompleted = dependencies.recordCompleted || defaultRecordCompleted;
  const recordFailed = dependencies.recordFailed || defaultRecordFailed;
  const activityBase = {
    domain: 'listing' as const,
    scope: 'account' as const,
    accountId: input.accountId,
    trigger: 'manual' as const,
    runId,
    metadata: {
      listingId: input.listingId,
    },
  };

  await recordStarted({
    ...activityBase,
    title: '微信小店商品草稿创建开始',
    detail: input.request.title,
  });

  try {
    const getClient = dependencies.getClient || defaultGetClient;
    const client = await getClient(input.accountId);
    const created = await client.addProduct(input.request);
    const result: WxProductDraftCreationResult = {
      accountId: input.accountId,
      listingId: input.listingId,
      productId: created.productId,
      createTime: created.createTime,
      autoListing: input.autoListing ?? input.request.listing === 1,
      uploadedImageCount: input.uploadedImageCount,
    };

    await recordCompleted({
      ...activityBase,
      title: input.autoListing ? '微信小店商品已创建并提交审核' : '微信小店商品草稿创建完成',
      detail: `${input.request.title}，商品 ID：${created.productId}`,
      summary: {
        uploadedImages: input.uploadedImageCount,
      },
    });
    return result;
  } catch (error) {
    const message = errorMessage(error, '微信小店商品草稿创建失败');
    await recordFailed({
      ...activityBase,
      title: '微信小店商品草稿创建失败',
      error: { message },
    });
    throw error;
  }
}

export async function createWxProductDraftFromCollectedListing(
  input: CreateWxProductDraftInput,
  dependencies: CreateWxProductDraftDependencies = {},
): Promise<WxProductDraftCreationResult> {
  const prepared = await prepareWxProductDraftFromCollectedListing(input, dependencies);
  return submitPreparedWxProductDraft({
    accountId: prepared.accountId,
    listingId: prepared.listingId,
    request: prepared.request,
    uploadedImageCount: prepared.uploadedImageCount,
    autoListing: input.autoListing,
  }, dependencies);
}
