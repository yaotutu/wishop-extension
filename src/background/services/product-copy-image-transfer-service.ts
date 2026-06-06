import type {
  ProductCopyContentSettings,
  ProductCopyPricingSettings,
  ProductCopyRecord,
  ProductCopySkuSettings,
  TaobaoProductImageAsset,
  TaobaoProductImageRole,
} from '../../shared/types.ts';
import type { WxShopListingClient } from '../wxshop/listing/types.ts';
import { collectWxDraftSourceImages } from './product-copy-wx-draft-mapper.ts';

type ImageTransferLogger = Pick<ReturnType<typeof import('../logging/diagnostic-logger.ts').createDiagnosticLogger>, 'info' | 'warn' | 'error'>;

export interface WxDraftImageUploadSource {
  sourceUrl: string;
  role: TaobaoProductImageRole;
  candidates: string[];
}

export interface ProductCopyImageDownloadResult {
  sourceUrl: string;
  fetchedUrl: string;
  filename: string;
  mimeType: string;
  data: ArrayBuffer;
}

export interface ProductCopyImageDownloadDependencies {
  fetch?: typeof fetch;
}

export interface UploadWxDraftSourceImagesOptions {
  logger?: ImageTransferLogger;
  pricing?: ProductCopyPricingSettings;
  content?: ProductCopyContentSettings;
  sku?: ProductCopySkuSettings;
  downloadImage?: (source: WxDraftImageUploadSource) => Promise<ProductCopyImageDownloadResult>;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function normalizeImageCandidate(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('//') ? `https:${trimmed}` : trimmed.replace(/^http:\/\//i, 'https://');
}

function assetMatchesSource(asset: TaobaoProductImageAsset, sourceUrl: string): boolean {
  const normalizedSourceUrl = normalizeImageCandidate(sourceUrl);
  if (normalizeImageCandidate(asset.url) === normalizedSourceUrl) return true;
  if (normalizeImageCandidate(asset.normalizedUrl) === normalizedSourceUrl) return true;
  return Object.values(asset.lazyAttrs || {}).some(value => normalizeImageCandidate(value) === normalizedSourceUrl);
}

function candidatesFromAsset(asset: TaobaoProductImageAsset): string[] {
  return uniqueStrings([
    // 页面真实记录的原始 URL 往往是浏览器实际加载过的尺寸图，比强行还原出的“原图”更稳定。
    normalizeImageCandidate(asset.url),
    normalizeImageCandidate(asset.lazyAttrs?.src || ''),
    normalizeImageCandidate(asset.lazyAttrs?.['data-src'] || ''),
    normalizeImageCandidate(asset.lazyAttrs?.['data-ks-lazyload'] || ''),
    normalizeImageCandidate(asset.lazyAttrs?.['data-original'] || ''),
    normalizeImageCandidate(asset.lazyAttrs?.['data-lazy-src'] || ''),
    normalizeImageCandidate(asset.normalizedUrl),
  ]);
}

function resolveImageRole(listing: ProductCopyRecord, sourceUrl: string): TaobaoProductImageRole {
  const matchedAsset = listing.images.assets.find(asset => assetMatchesSource(asset, sourceUrl));
  if (matchedAsset?.role) return matchedAsset.role;
  if (listing.images.main.includes(sourceUrl)) return 'main';
  if (listing.images.detail.includes(sourceUrl)) return 'detail';
  if (listing.sku.matrix.some(sku => sku.imageUrl === sourceUrl)) return 'sku';
  return 'unknown';
}

function resolveImageCandidates(listing: ProductCopyRecord, sourceUrl: string): string[] {
  const matchedAssets = listing.images.assets.filter(asset => assetMatchesSource(asset, sourceUrl));
  return uniqueStrings([
    ...matchedAssets.flatMap(candidatesFromAsset),
    normalizeImageCandidate(sourceUrl),
  ]);
}

export function buildWxDraftImageUploadSources(
  listing: ProductCopyRecord,
  options: Pick<UploadWxDraftSourceImagesOptions, 'pricing' | 'content' | 'sku'> = {},
): WxDraftImageUploadSource[] {
  return collectWxDraftSourceImages(listing, options).map(sourceUrl => ({
    sourceUrl,
    role: resolveImageRole(listing, sourceUrl),
    candidates: resolveImageCandidates(listing, sourceUrl),
  }));
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  return 'jpg';
}

function filenameForImage(source: WxDraftImageUploadSource, mimeType: string): string {
  const role = source.role === 'unknown' ? 'image' : source.role;
  const extension = extensionFromMimeType(mimeType);
  const signature = source.sourceUrl
    .replace(/^https?:\/\//iu, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `wishop-taobao-${role}-${signature || 'image'}.${extension}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function normalizeMimeType(value: string | null, url: string): string {
  const contentType = value?.split(';')[0]?.trim().toLowerCase() || '';
  if (contentType.startsWith('image/')) return contentType;
  if (/\.(png)(?:$|[?#])/iu.test(url)) return 'image/png';
  if (/\.(webp)(?:$|[?#])/iu.test(url)) return 'image/webp';
  if (/\.(gif)(?:$|[?#])/iu.test(url)) return 'image/gif';
  if (/\.(jpe?g)(?:$|[?#])/iu.test(url)) return 'image/jpeg';
  return '';
}

export async function downloadProductCopyImage(
  source: WxDraftImageUploadSource,
  dependencies: ProductCopyImageDownloadDependencies = {},
): Promise<ProductCopyImageDownloadResult> {
  const fetchImage = dependencies.fetch || fetch;
  const failures: string[] = [];
  for (const candidate of source.candidates) {
    try {
      const response = await fetchImage(candidate, {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) {
        failures.push(`${candidate} HTTP ${response.status}`);
        continue;
      }

      const mimeType = normalizeMimeType(response.headers.get('content-type'), candidate);
      if (!mimeType) {
        failures.push(`${candidate} 不是图片响应`);
        continue;
      }

      const data = await response.arrayBuffer();
      if (data.byteLength === 0) {
        failures.push(`${candidate} 图片内容为空`);
        continue;
      }

      return {
        sourceUrl: source.sourceUrl,
        fetchedUrl: candidate,
        filename: filenameForImage(source, mimeType),
        mimeType,
        data,
      };
    } catch (error) {
      failures.push(`${candidate} ${errorMessage(error, '请求失败')}`);
    }
  }

  throw new Error(`图片下载失败：${failures.join('；') || source.sourceUrl}`);
}

async function resolveUploadCandidateUrls(
  source: WxDraftImageUploadSource,
  downloadImage: (source: WxDraftImageUploadSource) => Promise<ProductCopyImageDownloadResult>,
  logger?: ImageTransferLogger,
): Promise<{ urls: string[]; localDownloadFailure?: string }> {
  try {
    const downloaded = await downloadImage(source);
    return {
      urls: uniqueStrings([downloaded.fetchedUrl, ...source.candidates]),
    };
  } catch (error) {
    const localDownloadFailure = errorMessage(error, '图片下载失败');
    logger?.warn('商品图片本地下载校验失败，改由微信小店按候选链接上传', {
      role: source.role,
      sourceUrl: source.sourceUrl,
      candidateCount: source.candidates.length,
      error: localDownloadFailure,
    });

    // 淘宝 CDN 有时会拒绝扩展后台 fetch，但微信小店服务端仍可能可以按 URL 拉取。
    // 本地下载失败时不能直接中断，应把页面采集到的候选链接逐个交给微信上传接口验证。
    return {
      urls: uniqueStrings([...source.candidates, source.sourceUrl]),
      localDownloadFailure,
    };
  }
}

async function uploadImageByCandidateUrls(
  client: WxShopListingClient,
  source: WxDraftImageUploadSource,
  urls: string[],
  localDownloadFailure?: string,
): Promise<{ uploaded: Awaited<ReturnType<WxShopListingClient['uploadImageByUrl']>>; uploadUrl: string }> {
  const failures: string[] = [];
  const failureMessages: string[] = [];

  for (const url of urls) {
    try {
      return {
        uploaded: await client.uploadImageByUrl(url),
        uploadUrl: url,
      };
    } catch (error) {
      const message = errorMessage(error, '微信小店图片上传失败');
      failureMessages.push(message);
      failures.push(`${url} ${message}`);
    }
  }

  if (!localDownloadFailure && failureMessages.length === 1) {
    throw new Error(failureMessages[0]);
  }

  const localDownloadText = localDownloadFailure ? `本地图片下载失败：${localDownloadFailure}；` : '';
  throw new Error(`${localDownloadText}微信小店按链接上传失败：${failures.join('；') || source.sourceUrl}`);
}

export async function uploadWxDraftSourceImages(
  listing: ProductCopyRecord,
  client: WxShopListingClient,
  options: UploadWxDraftSourceImagesOptions = {},
): Promise<Map<string, string>> {
  const uploadedImages = new Map<string, string>();
  const sources = buildWxDraftImageUploadSources(listing, {
    pricing: options.pricing,
    content: options.content,
    sku: options.sku,
  });
  const downloadImage = options.downloadImage || (source => downloadProductCopyImage(source));
  options.logger?.info('开始本地校验并上传微信小店商品图片', {
    copyId: listing.id,
    imageCount: sources.length,
  });

  for (const [index, source] of sources.entries()) {
    try {
      const candidateResult = await resolveUploadCandidateUrls(source, downloadImage, options.logger);
      const { uploaded, uploadUrl } = await uploadImageByCandidateUrls(
        client,
        source,
        candidateResult.urls,
        candidateResult.localDownloadFailure,
      );
      uploadedImages.set(source.sourceUrl, uploaded.imgUrl);
      options.logger?.info('商品图片本地校验后上传完成', {
        copyId: listing.id,
        imageIndex: index + 1,
        imageCount: sources.length,
        role: source.role,
        sourceUrl: source.sourceUrl,
        fetchedUrl: uploadUrl,
      });
    } catch (error) {
      const message = errorMessage(error, '微信小店图片上传失败');
      options.logger?.error('商品图片本地校验后上传失败', {
        copyId: listing.id,
        imageIndex: index + 1,
        imageCount: sources.length,
        role: source.role,
        sourceUrl: source.sourceUrl,
        error: message,
      });
      throw new Error(`第 ${index + 1}/${sources.length} 张商品图片上传失败：${message}`);
    }
  }

  return uploadedImages;
}
