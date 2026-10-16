import type {
  ProductCopyRecord,
  CreatePreparedWxDraftBoxProductInput,
  CreateWxDraftBoxProductInput,
  CreateWxDraftBoxProductPrepareInput,
  DeleteCreatedWxDraftBoxProductInput,
  DeleteCreatedWxDraftBoxProductResult,
  WxDraftBoxProductPrepareResult,
  WxProductDraftCreationResult,
  WxProductDraftBoxPreparedRequest,
} from '../../shared/types.ts';
import type { AppSettings } from '../../shared/settings.ts';
import type { OpenAiCompatibleJsonCompletionInput } from '../ai/openai-compatible-client.ts';
import type { WxShopCategoryProductRule, WxShopListingClient } from '../wxshop/listing/types.ts';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';
import {
  removeProductCopyCreatedProduct,
  saveProductCopyCreatedProduct,
} from '../store/product-copy-created-product-repository.ts';
import { addProductCopySourceBinding, setProductSources } from '../store/product-source-repository.ts';
import {
  collectWxDraftSourceImages,
  mapProductCopyRecordToWxAddProductRequest,
} from './product-copy-wx-draft-mapper.ts';
import { generateRuleDrivenWxProductAttributes } from './product-copy-wx-attribute-ai-service.ts';
import {
  type ProductCopyImageDownloadResult,
  type WxDraftImageUploadSource,
  uploadWxDraftSourceImages,
} from './product-copy-image-transfer-service.ts';
import { getCachedWxCategoryProductRule } from './wx-category-product-rule-cache-service.ts';

type ActivityRecorder = (input: Record<string, unknown>) => Promise<unknown>;
type CompleteJson = (input: OpenAiCompatibleJsonCompletionInput) => Promise<unknown>;

const DEFAULT_DRAFT_STOCK_NUM = 999;

export interface WxDraftBoxProductDependencies {
  getCopyRecord?: (copyId: string) => Promise<ProductCopyRecord | null>;
  getClient?: (accountId: string) => Promise<WxShopListingClient>;
  getCategoryProductRule?: (catId: string) => Promise<WxShopCategoryProductRule | null>;
  getSettings?: () => Promise<AppSettings>;
  completeJson?: CompleteJson;
  downloadImage?: (source: WxDraftImageUploadSource) => Promise<ProductCopyImageDownloadResult>;
  recordCreatedProduct?: (result: WxProductDraftCreationResult, source?: ProductCopyRecord | null) => Promise<unknown>;
  removeCreatedProduct?: (accountId: string, copyId: string) => Promise<unknown>;
  recordProductSource?: (result: WxProductDraftCreationResult, source?: ProductCopyRecord | null) => Promise<unknown>;
  removeProductSourceBinding?: (accountId: string, productId: string) => Promise<unknown>;
  recordStarted?: ActivityRecorder;
  recordCompleted?: ActivityRecorder;
  recordFailed?: ActivityRecorder;
}

function createRunId(input: { accountId: string; copyId: string }): string {
  return `createWxDraftBoxProduct:${input.accountId}:${input.copyId}:${Date.now()}`;
}

function createPrepareRunId(input: { accountId: string; copyId: string }): string {
  return `prepareWxDraftBoxProduct:${input.accountId}:${input.copyId}:${Date.now()}`;
}

function createDeleteRunId(input: { accountId: string; copyId: string; productId: string }): string {
  return `deleteCreatedWxDraftBoxProduct:${input.accountId}:${input.copyId}:${input.productId}:${Date.now()}`;
}

function validateInput(input: { accountId: string; copyId: string }): void {
  if (!input.accountId.trim()) throw new Error('缺少微信小店账号 ID');
  if (!input.copyId.trim()) throw new Error('缺少本地采集商品 ID');
}

function validateDeleteInput(input: DeleteCreatedWxDraftBoxProductInput): void {
  validateInput(input);
  if (!input.productId.trim()) throw new Error('缺少要删除的微信小店商品 ID');
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function leafCategoryId(catIds: string[]): string {
  return catIds.at(-1)?.trim() || '';
}

async function resolveExpressTemplateId(
  input: CreateWxDraftBoxProductPrepareInput,
  client: WxShopListingClient,
  logger = createDiagnosticLogger({ domain: 'productCopy', component: 'WxDraftPrepare' }),
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
  input: CreateWxDraftBoxProductPrepareInput,
  client: WxShopListingClient,
  logger = createDiagnosticLogger({ domain: 'productCopy', component: 'WxDraftPrepare' }),
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
  input: CreateWxDraftBoxProductPrepareInput,
  client: WxShopListingClient,
  logger = createDiagnosticLogger({ domain: 'productCopy', component: 'WxDraftPrepare' }),
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

async function uploadCopyRecordImages(
  listing: ProductCopyRecord,
  input: CreateWxDraftBoxProductPrepareInput,
  client: WxShopListingClient,
  dependencies: Pick<WxDraftBoxProductDependencies, 'downloadImage'>,
  logger = createDiagnosticLogger({ domain: 'productCopy', component: 'WxDraftPrepare' }),
): Promise<Map<string, string>> {
  const sourceImages = collectWxDraftSourceImages(listing, {
    pricing: input.pricing,
    content: input.content,
    sku: input.sku,
  });
  logger.info('开始上传微信小店商品图片', {
    copyId: listing.id,
    imageCount: sourceImages.length,
  });
  return uploadWxDraftSourceImages(listing, client, {
    logger,
    pricing: input.pricing,
    content: input.content,
    sku: input.sku,
    downloadImage: dependencies.downloadImage,
  });
}

async function defaultGetCopyRecord(copyId: string): Promise<ProductCopyRecord | null> {
  const repository = await import('../store/product-copy-record-repository.ts');
  return repository.getProductCopyRecord(copyId);
}

async function defaultGetClient(accountId: string): Promise<WxShopListingClient> {
  const registry = await import('../wxshop/client-registry.ts');
  return registry.getListingClient(accountId, 'productCopy');
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

async function defaultRecordCreatedProduct(
  result: WxProductDraftCreationResult,
  source?: ProductCopyRecord | null,
): Promise<unknown> {
  return saveProductCopyCreatedProduct(result, source ?? await defaultGetCopyRecord(result.copyId));
}

async function defaultRemoveCreatedProduct(accountId: string, copyId: string): Promise<unknown> {
  return removeProductCopyCreatedProduct(accountId, copyId);
}

async function defaultRemoveProductSourceBinding(accountId: string, productId: string): Promise<unknown> {
  return setProductSources(accountId, productId, []);
}

async function defaultRecordProductSource(
  result: WxProductDraftCreationResult,
  source?: ProductCopyRecord | null,
): Promise<unknown> {
  const copyRecord = source ?? await defaultGetCopyRecord(result.copyId);
  if (!copyRecord) throw new Error('采集商品不存在或已删除，无法自动关联货源');
  return addProductCopySourceBinding(result, copyRecord);
}

function summarizePreparedRequest(
  input: CreateWxDraftBoxProductPrepareInput,
  uploadedImageCount: number,
  request: WxProductDraftBoxPreparedRequest,
  warnings: string[],
): WxDraftBoxProductPrepareResult {
  return {
    accountId: input.accountId,
    copyId: input.copyId,
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
      listing: false,
    },
  };
}

async function resolveWxDraftProductAttributes(
  input: CreateWxDraftBoxProductPrepareInput,
  listing: ProductCopyRecord,
  dependencies: Pick<WxDraftBoxProductDependencies, 'getCategoryProductRule' | 'getSettings' | 'completeJson'>,
  logger = createDiagnosticLogger({ domain: 'productCopy', component: 'WxDraftPrepare' }),
): Promise<{
  attrs: CreateWxDraftBoxProductPrepareInput['attrs'];
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
    copyId: input.copyId,
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

export async function prepareWxDraftBoxProductFromCopyRecord(
  input: CreateWxDraftBoxProductPrepareInput,
  dependencies: WxDraftBoxProductDependencies = {},
): Promise<WxDraftBoxProductPrepareResult> {
  validateInput(input);
  const runId = createPrepareRunId(input);
  const logger = createDiagnosticLogger({
    domain: 'productCopy',
    component: 'WxDraftPrepare',
    accountId: input.accountId,
  });
  const recordStarted = dependencies.recordStarted || defaultRecordStarted;
  const recordCompleted = dependencies.recordCompleted || defaultRecordCompleted;
  const recordFailed = dependencies.recordFailed || defaultRecordFailed;
  const activityBase = {
    domain: 'productCopy' as const,
    scope: 'account' as const,
    accountId: input.accountId,
    trigger: 'manual' as const,
    runId,
    metadata: {
      copyId: input.copyId,
      catIds: input.catIds.join('/'),
      submitMode: 'draftBox',
    },
  };

  await recordStarted({
    ...activityBase,
    title: '微信小店草稿数据生成开始',
    detail: `采集商品：${input.copyId}`,
  });

  try {
    logger.info('开始读取本地采集商品', { copyId: input.copyId });
    const loadCopyRecord = dependencies.getCopyRecord || defaultGetCopyRecord;
    const listing = await loadCopyRecord(input.copyId);
    if (!listing) throw new Error('采集商品不存在或已删除');

    logger.info('开始创建微信小店 client', { copyId: input.copyId });
    const getClient = dependencies.getClient || defaultGetClient;
    const client = await getClient(input.accountId);
    const attrResult = await resolveWxDraftProductAttributes(input, listing, dependencies, logger);
    const defaults = await resolveWxDraftSystemDefaults(input, client, logger);
    const uploadedImages = await uploadCopyRecordImages(listing, input, client, dependencies, logger);
    logger.info('开始生成微信小店新增商品请求体', {
      copyId: input.copyId,
      uploadedImageCount: uploadedImages.size,
      skuCount: listing.sku.matrix.length,
      attrCount: attrResult.attrs?.length ?? listing.params.length,
      defaultStockNum: defaults.defaultStockNum,
    });
    const addProductRequest = mapProductCopyRecordToWxAddProductRequest(listing, {
      catIds: input.catIds,
      expressTemplateId: defaults.expressTemplateId,
      afterSaleAddressId: defaults.afterSaleAddressId,
      brandId: input.brandId,
      defaultStockNum: defaults.defaultStockNum,
      pricing: input.pricing,
      content: input.content,
      sku: input.sku,
      attrs: attrResult.attrs,
      uploadedImages,
    }) as WxProductDraftBoxPreparedRequest;
    const prepared = summarizePreparedRequest(input, uploadedImages.size, addProductRequest, attrResult.warnings);

    await recordCompleted({
      ...activityBase,
      title: '微信小店草稿数据生成完成',
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
    const message = errorMessage(error, '微信小店草稿数据生成失败');
    logger.error('微信小店草稿数据生成失败', {
      copyId: input.copyId,
      error: message,
    });
    await recordFailed({
      ...activityBase,
      title: '微信小店草稿数据生成失败',
      detail: `采集商品：${input.copyId}`,
      error: { message },
    });
    throw error;
  }
}

export async function createPreparedWxDraftBoxProduct(
  input: CreatePreparedWxDraftBoxProductInput,
  dependencies: WxDraftBoxProductDependencies = {},
): Promise<WxProductDraftCreationResult> {
  validateInput(input);
  if (input.request.listing !== 0) {
    throw new Error('草稿箱创建命令只允许提交 listing=0 的微信商品请求');
  }

  const runId = createRunId(input);
  const logger = createDiagnosticLogger({
    domain: 'productCopy',
    component: 'WxDraftCreate',
    accountId: input.accountId,
  });
  const recordStarted = dependencies.recordStarted || defaultRecordStarted;
  const recordCompleted = dependencies.recordCompleted || defaultRecordCompleted;
  const recordFailed = dependencies.recordFailed || defaultRecordFailed;
  const recordCreatedProduct = dependencies.recordCreatedProduct || defaultRecordCreatedProduct;
  const recordProductSource = dependencies.recordProductSource || defaultRecordProductSource;
  const activityBase = {
    domain: 'productCopy' as const,
    scope: 'account' as const,
    accountId: input.accountId,
    trigger: 'manual' as const,
    runId,
    metadata: {
      copyId: input.copyId,
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
      copyId: input.copyId,
      productId: created.productId,
      createTime: created.createTime,
      listing: 0,
      uploadedImageCount: input.uploadedImageCount,
    };

    await recordCompleted({
      ...activityBase,
      title: '微信小店商品草稿创建完成',
      detail: `${input.request.title}，商品 ID：${created.productId}`,
      summary: {
        uploadedImages: input.uploadedImageCount,
      },
    });
    try {
      await recordCreatedProduct(result);
    } catch (error) {
      logger.warn('复制完成记录写入失败，微信小店草稿已创建', {
        copyId: input.copyId,
        productId: created.productId,
        error: errorMessage(error, '复制完成记录写入失败'),
      });
    }
    if (input.autoSourceBinding === true) {
      const loadCopyRecord = dependencies.getCopyRecord || defaultGetCopyRecord;
      const source = await loadCopyRecord(input.copyId);
      try {
        await recordProductSource(result, source);
      } catch (error) {
        logger.warn('复制商品货源自动关联失败，微信小店草稿已创建', {
          copyId: input.copyId,
          productId: created.productId,
          error: errorMessage(error, '复制商品货源自动关联失败'),
        });
      }
    }
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

export async function createWxDraftBoxProductFromCopyRecord(
  input: CreateWxDraftBoxProductInput,
  dependencies: WxDraftBoxProductDependencies = {},
): Promise<WxProductDraftCreationResult> {
  const prepared = await prepareWxDraftBoxProductFromCopyRecord(input, dependencies);
  return createPreparedWxDraftBoxProduct({
    accountId: prepared.accountId,
    copyId: prepared.copyId,
    request: prepared.request,
    uploadedImageCount: prepared.uploadedImageCount,
    autoSourceBinding: input.autoSourceBinding,
  }, dependencies);
}

export async function deleteCreatedWxDraftBoxProduct(
  input: DeleteCreatedWxDraftBoxProductInput,
  dependencies: Pick<WxDraftBoxProductDependencies, 'getClient' | 'removeCreatedProduct' | 'removeProductSourceBinding' | 'recordStarted' | 'recordCompleted' | 'recordFailed'> = {},
): Promise<DeleteCreatedWxDraftBoxProductResult> {
  validateDeleteInput(input);

  const productId = input.productId.trim();
  const productTitle = input.productTitle?.trim() || productId;
  const runId = createDeleteRunId({ ...input, productId });
  const logger = createDiagnosticLogger({
    domain: 'productCopy',
    component: 'WxDraftCleanup',
    accountId: input.accountId,
  });
  const recordStarted = dependencies.recordStarted || defaultRecordStarted;
  const recordCompleted = dependencies.recordCompleted || defaultRecordCompleted;
  const recordFailed = dependencies.recordFailed || defaultRecordFailed;
  const removeCreatedProduct = dependencies.removeCreatedProduct || defaultRemoveCreatedProduct;
  const removeProductSourceBinding = dependencies.removeProductSourceBinding || defaultRemoveProductSourceBinding;
  const activityBase = {
    domain: 'productCopy' as const,
    scope: 'account' as const,
    accountId: input.accountId,
    trigger: 'manual' as const,
    runId,
    metadata: {
      copyId: input.copyId,
      productId,
      submitMode: 'draftBoxCleanup',
    },
  };

  await recordStarted({
    ...activityBase,
    title: '微信小店测试草稿删除开始',
    detail: productTitle,
  });

  try {
    logger.info('开始删除复制商品测试创建的微信小店草稿', {
      copyId: input.copyId,
      productId,
    });
    const getClient = dependencies.getClient || defaultGetClient;
    const result = await (await getClient(input.accountId)).deleteProduct(productId);

    if (result.errcode === 0) {
      await recordCompleted({
        ...activityBase,
        title: '微信小店测试草稿删除完成',
        detail: productTitle,
      });
      try {
        await removeCreatedProduct(input.accountId, input.copyId);
      } catch (error) {
        logger.warn('复制完成记录移除失败，微信小店测试草稿已删除', {
          copyId: input.copyId,
          productId,
          error: errorMessage(error, '复制完成记录移除失败'),
        });
      }
      try {
        await removeProductSourceBinding(input.accountId, productId);
      } catch (error) {
        logger.warn('复制商品货源关联移除失败，微信小店测试草稿已删除', {
          copyId: input.copyId,
          productId,
          error: errorMessage(error, '复制商品货源关联移除失败'),
        });
      }
      return {
        accountId: input.accountId,
        copyId: input.copyId,
        productId,
        deleted: true,
      };
    }

    const message = result.errmsg || '微信小店删除商品草稿失败';
    await recordFailed({
      ...activityBase,
      title: '微信小店测试草稿删除失败',
      detail: productTitle,
      error: { message, code: result.errcode },
    });
    return {
      accountId: input.accountId,
      copyId: input.copyId,
      productId,
      deleted: false,
      errorCode: result.errcode,
      error: message,
    };
  } catch (error) {
    const message = errorMessage(error, '微信小店测试草稿删除失败');
    logger.error('删除复制商品测试创建的微信小店草稿失败', {
      copyId: input.copyId,
      productId,
      error: message,
    });
    await recordFailed({
      ...activityBase,
      title: '微信小店测试草稿删除失败',
      detail: productTitle,
      error: { message },
    });
    throw error;
  }
}
