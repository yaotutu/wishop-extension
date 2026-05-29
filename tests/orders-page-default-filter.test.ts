import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, '../src/pages/orders/OrdersPage.tsx'), 'utf8');

test('orders page defaults to pending shipment instead of all orders', () => {
  assert.match(
    source,
    /const DEFAULT_ORDER_STATUS = OrderStatusEnum\.PendingShipment;/,
    'default order status should be pending shipment',
  );

  assert.match(
    source,
    /useState<OrderStatus \| undefined>\(DEFAULT_ORDER_STATUS\)/,
    'initial status filter should use the default status',
  );

  const scopeResetStart = source.indexOf('useEffect(() => {\n    setActiveStatus');
  assert.notEqual(scopeResetStart, -1, 'scope reset effect should update active status');

  const scopeResetEnd = source.indexOf('  }, [scope]);', scopeResetStart);
  assert.notEqual(scopeResetEnd, -1, 'scope reset effect should depend on scope');

  const scopeResetBlock = source.slice(scopeResetStart, scopeResetEnd);
  assert.match(
    scopeResetBlock,
    /setActiveStatus\(DEFAULT_ORDER_STATUS\);/,
    'scope changes should reset the status filter to the default status',
  );
});
