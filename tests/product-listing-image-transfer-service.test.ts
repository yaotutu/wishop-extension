import assert from 'node:assert/strict';
import test from 'node:test';
import type { CollectedProductListing } from '../src/shared/types.ts';
import type { WxShopListingClient } from '../src/background/wxshop/listing/types.ts';
import {
  downloadProductListingImage,
  uploadWxDraftSourceImages,
} from '../src/background/services/product-listing-image-transfer-service.ts';
import { sampleCollectedProductListing } from './product-listing-fixtures.ts';

function oneImageListing(): CollectedProductListing {
  const normalizedUrl = 'https://img.alicdn.com/imgextra/i1/100/O1CN-demo.jpg';
  const rawUrl = 'https://img.alicdn.com/imgextra/i1/100/O1CN-demo_790x790q90.jpg';
  return sampleCollectedProductListing({
    images: {
      main: [normalizedUrl, 'https://img.alicdn.com/main-2.jpg', 'https://img.alicdn.com/main-3.jpg'],
      detail: [],
      assets: [{
        url: rawUrl,
        normalizedUrl,
        role: 'main',
        source: 'pageModel',
        flags: [],
      }],
    },
    detail: {
      text: '',
      source: 'none',
      images: [],
    },
    sku: {
      ...sampleCollectedProductListing().sku,
      matrix: [],
    },
  });
}

function silentLogger() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

test('downloads the next candidate when a normalized Taobao image URL is not reachable', async () => {
  const attemptedUrls: string[] = [];
  const downloaded = await downloadProductListingImage({
    sourceUrl: 'https://img.alicdn.com/imgextra/i1/100/O1CN-demo.jpg',
    candidates: [
      'https://img.alicdn.com/imgextra/i1/100/O1CN-demo.jpg',
      'https://img.alicdn.com/imgextra/i1/100/O1CN-demo_790x790q90.jpg',
    ],
    role: 'main',
  }, {
    fetch: async url => {
      attemptedUrls.push(String(url));
      if (String(url).endsWith('O1CN-demo.jpg')) {
        return new Response('not found', {
          status: 404,
          headers: { 'content-type': 'text/plain' },
        });
      }
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      });
    },
  });

  assert.deepEqual(attemptedUrls, [
    'https://img.alicdn.com/imgextra/i1/100/O1CN-demo.jpg',
    'https://img.alicdn.com/imgextra/i1/100/O1CN-demo_790x790q90.jpg',
  ]);
  assert.equal(downloaded.fetchedUrl, 'https://img.alicdn.com/imgextra/i1/100/O1CN-demo_790x790q90.jpg');
  assert.equal(downloaded.mimeType, 'image/jpeg');
  assert.equal(downloaded.data.byteLength, 4);
});

test('uploads the locally validated fetched URL to WeChat', async () => {
  const uploadUrlCalls: string[] = [];
  const client = {
    async uploadImageByUrl(imgUrl: string) {
      uploadUrlCalls.push(imgUrl);
      return { imgUrl: `https://mmecimage.cn/p/${uploadUrlCalls.length}.jpg` };
    },
  } as Partial<WxShopListingClient> as WxShopListingClient;

  const uploaded = await uploadWxDraftSourceImages(oneImageListing(), client, {
    logger: silentLogger(),
    downloadImage: async source => ({
      sourceUrl: source.sourceUrl,
      fetchedUrl: source.candidates[0],
      data: new Uint8Array([9, 8, 7]).buffer,
      mimeType: 'image/jpeg',
      filename: 'wishop-taobao-main-1.jpg',
    }),
  });

  assert.equal(uploadUrlCalls.length, 3);
  assert.equal(uploadUrlCalls[0], 'https://img.alicdn.com/imgextra/i1/100/O1CN-demo_790x790q90.jpg');
  assert.equal(uploaded.get('https://img.alicdn.com/imgextra/i1/100/O1CN-demo.jpg'), 'https://mmecimage.cn/p/1.jpg');
});
