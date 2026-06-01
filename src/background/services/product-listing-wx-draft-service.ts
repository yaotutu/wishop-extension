import type {
  CollectedProductListing,
  CreateWxProductDraftPrepareInput,
  CreateWxProductDraftInput,
  SubmitPreparedWxProductDraftInput,
  WxProductDraftCreationResult,
  WxProductDraftPrepareResult,
} from '../../shared/types.ts';
import type { WxShopListingClient } from '../wxshop/listing/types.ts';
import {
  collectWxDraftSourceImages,
  mapCollectedListingToWxAddProductRequest,
} from './product-listing-wx-draft-mapper.ts';

type ActivityRecorder = (input: Record<string, unknown>) => Promise<unknown>;

export interface CreateWxProductDraftDependencies {
  getListing?: (listingId: string) => Promise<CollectedProductListing | null>;
  getClient?: (accountId: string) => Promise<WxShopListingClient>;
  recordStarted?: ActivityRecorder;
  recordCompleted?: ActivityRecorder;
  recordFailed?: ActivityRecorder;
}

function createRunId(input: { accountId: string; listingId: string }): string {
  return `createWxDraft:${input.accountId}:${input.listingId}:${Date.now()}`;
}

function validateInput(input: { accountId: string; listingId: string }): void {
  if (!input.accountId.trim()) throw new Error('缺少微信小店账号 ID');
  if (!input.listingId.trim()) throw new Error('缺少本地采集商品 ID');
}

async function uploadListingImages(
  listing: CollectedProductListing,
  client: WxShopListingClient,
): Promise<Map<string, string>> {
  const uploadedImages = new Map<string, string>();
  for (const imageUrl of collectWxDraftSourceImages(listing)) {
    const uploaded = await client.uploadImageByUrl(imageUrl);
    uploadedImages.set(imageUrl, uploaded.imgUrl);
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
): WxProductDraftPrepareResult {
  return {
    accountId: input.accountId,
    listingId: input.listingId,
    request,
    uploadedImageCount,
    preparedAt: Date.now(),
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

export async function prepareWxProductDraftFromCollectedListing(
  input: CreateWxProductDraftPrepareInput,
  dependencies: CreateWxProductDraftDependencies = {},
): Promise<WxProductDraftPrepareResult> {
  validateInput(input);

  const loadListing = dependencies.getListing || defaultGetListing;
  const listing = await loadListing(input.listingId);
  if (!listing) throw new Error('采集商品不存在或已删除');

  const getClient = dependencies.getClient || defaultGetClient;
  const client = await getClient(input.accountId);
  const uploadedImages = await uploadListingImages(listing, client);
  const addProductRequest = mapCollectedListingToWxAddProductRequest(listing, {
    catIds: input.catIds,
    expressTemplateId: input.expressTemplateId,
    brandId: input.brandId,
    defaultStockNum: input.defaultStockNum,
    autoListing: input.autoListing,
    attrs: input.attrs,
    uploadedImages,
  });

  return summarizePreparedRequest(input, uploadedImages.size, addProductRequest);
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
    const message = error instanceof Error ? error.message : '微信小店商品草稿创建失败';
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
