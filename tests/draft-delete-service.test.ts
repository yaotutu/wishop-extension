import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteDraftWithClient } from '../src/background/services/draft-service.ts';
import type { WxShopListingClient } from '../src/background/wxshop/listing/types.ts';
import type { AddLogFn } from '../src/shared/types.ts';

function makeClient(result: { errcode: number; errmsg: string }): WxShopListingClient {
  return {
    async deleteProduct(productId: string) {
      assert.equal(productId, 'draft-1');
      return result;
    },
  } as Partial<WxShopListingClient> as WxShopListingClient;
}

test('manual draft deletion records a successful product audit log entry', async () => {
  const logs: Parameters<AddLogFn>[0][] = [];

  const result = await deleteDraftWithClient({
    api: makeClient({ errcode: 0, errmsg: 'ok' }),
    addLog: log => logs.push(log),
    productId: 'draft-1',
    productTitle: '测试草稿',
    runId: 'run-1',
  });

  assert.deepEqual(result, { success: true });
  assert.deepEqual(logs, [{
    runId: 'run-1',
    productId: 'draft-1',
    productTitle: '测试草稿',
    action: 'delete',
    status: 'success',
    errorMsg: '用户从执行记录手动删除草稿商品',
  }]);
});

test('manual draft deletion records WeChat API error details', async () => {
  const logs: Parameters<AddLogFn>[0][] = [];

  const result = await deleteDraftWithClient({
    api: makeClient({ errcode: 10020208, errmsg: '当前商品状态不可删除' }),
    addLog: log => logs.push(log),
    productId: 'draft-1',
    productTitle: '测试草稿',
    runId: 'run-1',
  });

  assert.deepEqual(result, {
    success: false,
    errorCode: 10020208,
    error: '当前商品状态不可删除',
  });
  assert.deepEqual(logs, [{
    runId: 'run-1',
    productId: 'draft-1',
    productTitle: '测试草稿',
    action: 'delete',
    status: 'failed',
    errorCode: 10020208,
    errorMsg: '当前商品状态不可删除',
  }]);
});
