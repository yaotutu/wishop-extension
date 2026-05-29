import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createExternalApiError,
  externalErrorMetadata,
  formatExternalErrorDetail,
  normalizeExternalRequestError,
} from '../src/background/errors/external-error.ts';

const requestContext = {
  service: '微信小店',
  method: 'POST',
  path: '/channels/ec/order/list/get',
  stage: '拉取待发货订单',
};

test('normalizes axios network errors with sanitized request context', () => {
  const error = {
    isAxiosError: true,
    message: 'Network Error',
    code: 'ERR_NETWORK',
    request: {},
  };

  const normalized = normalizeExternalRequestError(error, requestContext);

  assert.equal(normalized.kind, 'network');
  assert.equal(normalized.message, '网络连接失败');
  assert.equal(normalized.service, '微信小店');
  assert.equal(normalized.method, 'POST');
  assert.equal(normalized.path, '/channels/ec/order/list/get');
  assert.equal(normalized.stage, '拉取待发货订单');
  assert.equal(normalized.transient, true);
  assert.equal(formatExternalErrorDetail(normalized), '阶段：拉取待发货订单；服务：微信小店；接口：POST /channels/ec/order/list/get；错误类型：网络连接失败；错误码：ERR_NETWORK；建议：偶发通常可忽略，连续出现请检查本机网络、代理/VPN、DNS 或微信接口连通性');
  assert.deepEqual(externalErrorMetadata(normalized), {
    stage: '拉取待发货订单',
    service: '微信小店',
    method: 'POST',
    endpoint: '/channels/ec/order/list/get',
    errorKind: 'network',
    errorCode: 'ERR_NETWORK',
    transient: true,
  });
});

test('normalizes axios timeout errors as transient timeout failures', () => {
  const normalized = normalizeExternalRequestError({
    isAxiosError: true,
    message: 'timeout of 10000ms exceeded',
    code: 'ECONNABORTED',
    request: {},
  }, requestContext);

  assert.equal(normalized.kind, 'timeout');
  assert.equal(normalized.message, '请求超时');
  assert.equal(normalized.transient, true);
});

test('normalizes axios HTTP response errors without leaking request URL query', () => {
  const normalized = normalizeExternalRequestError({
    isAxiosError: true,
    message: 'Request failed with status code 502',
    code: 'ERR_BAD_RESPONSE',
    response: {
      status: 502,
      headers: {
        'x-request-id': 'req-123',
      },
    },
    config: {
      url: 'https://api.weixin.qq.com/channels/ec/order/list/get?access_token=secret',
    },
  }, requestContext);

  assert.equal(normalized.kind, 'http');
  assert.equal(normalized.message, '微信小店接口 HTTP 502');
  assert.equal(normalized.status, 502);
  assert.equal(normalized.requestId, 'req-123');
  assert.equal(externalErrorMetadata(normalized).endpoint, '/channels/ec/order/list/get');
});

test('creates WeChat API business errors with stable code metadata', () => {
  const normalized = createExternalApiError(requestContext, 40001, 'invalid credential, access_token is invalid or not latest');

  assert.equal(normalized.kind, 'api');
  assert.equal(normalized.message, '微信小店接口返回错误 40001：invalid credential, access_token is invalid or not latest');
  assert.equal(normalized.code, 40001);
  assert.equal(normalized.transient, false);
  assert.equal(externalErrorMetadata(normalized).errorCode, 40001);
});
