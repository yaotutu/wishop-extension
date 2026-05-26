import assert from 'node:assert/strict';
import test from 'node:test';
import 'fake-indexeddb/auto';
import { extensionDb } from '../src/background/db/extension-db.ts';
import { addAccount, getAccount } from '../src/background/store/account-repository.ts';
import { getTaskConfig, setTaskConfig } from '../src/background/store/task-config-repository.ts';
import { getProductSources, setProductSources } from '../src/background/store/product-source-repository.ts';
import { getOrderAssociations, setOrderAssociation } from '../src/background/store/order-association-repository.ts';
import { getRealAddressCaches, setRealAddressCache } from '../src/background/store/real-address-repository.ts';

async function resetDb(): Promise<void> {
  await extensionDb.delete();
  await extensionDb.open();
}

test('account repositories create account metadata and workspace data in IndexedDB', async () => {
  await resetDb();

  const account = await addAccount('店铺一', { appId: 'app-1', appSecret: 'secret-1' });
  await setTaskConfig(account.id, {
    listUnreviewed: false,
    listUnreviewedQuantity: 20,
    autoDeleteFailed: false,
  });
  await setProductSources(account.id, 'product-1', [{
    id: '',
    url: 'https://item.taobao.com/item.htm?id=1',
    quantity: 2,
    remark: '主货源',
    createdAt: 0,
    updatedAt: 0,
  }]);
  await setOrderAssociation(account.id, 'order-1', {
    internalRemark: '已配货',
    linkedOrders: [],
  });
  await setRealAddressCache(account.id, 'order-1', {
    user_name: '张三',
    postal_code: '',
    province_name: '浙江省',
    city_name: '杭州市',
    county_name: '西湖区',
    detail_info: '文三路 1 号',
    tel_number: '13800000000',
    house_number: '',
  });

  const storedAccount = await extensionDb.accounts.get(account.id);
  const workspace = await extensionDb.accountWorkspaces.get(account.id);

  assert.equal(storedAccount?.name, '店铺一');
  assert.equal(workspace?.taskConfig.listUnreviewed, false);
  assert.equal((await getAccount(account.id))?.config.appId, 'app-1');
  assert.equal((await getTaskConfig(account.id)).listUnreviewedQuantity, 20);
  assert.equal((await getProductSources(account.id))[0]?.productId, 'product-1');
  assert.equal((await getOrderAssociations(account.id))[0]?.internalRemark, '已配货');
  assert.equal((await getRealAddressCaches(account.id))[0]?.address.user_name, '张三');
  assert.equal((await extensionDb.accountSyncStates.get(account.id))?.dirty, true);
});
