import assert from 'node:assert/strict';
import test from 'node:test';
import { appendAccessTokenToWxPath } from '../src/background/wxshop/core/request-url.ts';

test('appends access token to a WeChat API path without existing query parameters', () => {
  assert.equal(
    appendAccessTokenToWxPath('/channels/ec/product/add', 'TOKEN'),
    'https://api.weixin.qq.com/channels/ec/product/add?access_token=TOKEN',
  );
});

test('appends access token to a WeChat API path that already has query parameters', () => {
  assert.equal(
    appendAccessTokenToWxPath('/shop/ec/basics/img/upload?upload_type=1&resp_type=1', 'TOKEN'),
    'https://api.weixin.qq.com/shop/ec/basics/img/upload?upload_type=1&resp_type=1&access_token=TOKEN',
  );
});
