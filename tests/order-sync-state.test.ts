import assert from 'node:assert/strict';
import test from 'node:test';
import { latestOrderSyncFinishedAt } from '../src/shared/order-sync-state.ts';

test('uses the latest account sync finish time when aggregate scope has no direct finish time', () => {
  assert.equal(latestOrderSyncFinishedAt({
    lastFinishedAt: undefined,
    accountStates: [
      { lastFinishedAt: 1700000000000 },
      { lastFinishedAt: 1700000010000 },
    ],
  }), 1700000010000);
});
