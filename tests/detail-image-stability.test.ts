import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForStableDetailImages } from '../src/content/taobao/runtime/detail-image-stability.ts';

test('waits until detail image list is stable instead of returning the first partial render', async () => {
  const reads = [
    [],
    ['detail-1.jpg'],
    ['detail-1.jpg', 'detail-2.jpg', 'detail-3.jpg'],
    ['detail-1.jpg', 'detail-2.jpg', 'detail-3.jpg'],
    ['detail-1.jpg', 'detail-2.jpg', 'detail-3.jpg'],
  ];
  let readIndex = 0;

  const images = await waitForStableDetailImages(
    () => reads[Math.min(readIndex++, reads.length - 1)],
    async () => {},
    { maxAttempts: 8, intervalMs: 0, stableReads: 3 },
  );

  assert.deepEqual(images, ['detail-1.jpg', 'detail-2.jpg', 'detail-3.jpg']);
});

test('returns the best non-empty detail image list when the list never stabilizes', async () => {
  const reads = [
    [],
    ['detail-1.jpg'],
    ['detail-1.jpg', 'detail-2.jpg'],
    ['detail-1.jpg'],
  ];
  let readIndex = 0;

  const images = await waitForStableDetailImages(
    () => reads[Math.min(readIndex++, reads.length - 1)],
    async () => {},
    { maxAttempts: 4, intervalMs: 0, stableReads: 3 },
  );

  assert.deepEqual(images, ['detail-1.jpg', 'detail-2.jpg']);
});
