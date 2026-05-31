import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, '../src/pages/orders/components/OrderTableColumns.tsx'), 'utf8');

test('order table renders a shared serial column before order information', () => {
  const serialStart = source.indexOf("title: '序号'");
  assert.notEqual(serialStart, -1, 'serial column should exist');

  const orderInfoStart = source.indexOf("key: 'order_info'");
  assert.notEqual(orderInfoStart, -1, 'order information column should exist');
  assert.equal(serialStart < orderInfoStart, true, 'serial column should be the first business column');

  const serialBlock = source.slice(serialStart, orderInfoStart);
  assert.match(serialBlock, /title: '序号'/, 'serial column should use a clear title');
  assert.match(serialBlock, /width: 56/, 'serial column should stay compact');
  assert.match(serialBlock, /index \+ 1/, 'serial column should render one-based row numbers');
});

test('all-account order table renders account inside order information instead of a separate column', () => {
  assert.equal(source.includes("title: '账号'"), false, 'account should not be a standalone table column');

  const orderInfoStart = source.indexOf("key: 'order_info'");
  assert.notEqual(orderInfoStart, -1, 'order information column should exist');

  const nextColumnStart = source.indexOf("title: '实付款'", orderInfoStart);
  assert.notEqual(nextColumnStart, -1, 'price column should follow order information');

  const orderInfoBlock = source.slice(orderInfoStart, nextColumnStart);
  assert.match(orderInfoBlock, /showAccount(?:Column|Info)/, 'order information should conditionally render account information');
  assert.match(orderInfoBlock, /accountLabel = record\.accountName \|\| record\.accountId/, 'account label should prefer account name');
  assert.match(orderInfoBlock, /<Tag[\s\S]*\{accountLabel\}/, 'account tag should render the account label');
});
