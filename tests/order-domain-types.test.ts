import assert from 'node:assert/strict';
import test from 'node:test';
import type { OrderScope, OrderSearchSource, OrderSyncState } from '../src/shared/types.ts';
import { queryKeys } from '../src/query/query-keys.ts';

test('order query keys include scope and search source', () => {
  const allScope: OrderScope = { type: 'all' };
  const accountScope: OrderScope = { type: 'account', accountId: 'account-1' };
  const source: OrderSearchSource = 'remote';
  const state: OrderSyncState = { scope: allScope, running: false, accountStates: [] };

  assert.equal(state.scope.type, 'all');
  assert.deepEqual(queryKeys.orders.list(allScope, undefined, null, 'all'), ['orders', 'list', 'all', '', 'all', 'all', '', '']);
  assert.deepEqual(queryKeys.orders.search(accountScope, { search_type: 'order_id', keyword: '123' }, source), [
    'orders',
    'search',
    'account',
    'account-1',
    'remote',
    'order_id',
    '123',
  ]);
});
