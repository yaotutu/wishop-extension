import assert from 'node:assert/strict';
import test from 'node:test';
import 'fake-indexeddb/auto';
import { extensionDb } from '../src/background/db/extension-db.ts';
import { addAccount } from '../src/background/store/account-repository.ts';
import { DuplicateAppIdError, isDuplicateAppIdError } from '../src/background/store/account-errors.ts';

async function resetDb(): Promise<void> {
  await extensionDb.delete();
  await extensionDb.open();
}

test('addAccount rejects a duplicate appId and keeps only one record', async () => {
  await resetDb();

  // 先正常添加一个店铺，建立已存在的 appId。
  const first = await addAccount('店铺一', { appId: 'wx-dup-1', appSecret: 'secret-1' });
  assert.equal(first.config.appId, 'wx-dup-1');

  // 同一 appId 再加一个，应当被拒绝。
  await assert.rejects(
    () => addAccount('店铺二', { appId: 'wx-dup-1', appSecret: 'secret-2' }),
    (error: unknown) => {
      // 抛出的必须是结构化的 DuplicateAppIdError，而不是普通 Error，
      // 这样前端批量导入才能拿到 appId 给精准提示。
      assert.ok(isDuplicateAppIdError(error), 'should be DuplicateAppIdError');
      assert.equal((error as DuplicateAppIdError).appId, 'wx-dup-1');
      // message 不应泄露 appSecret，只有 appId 和已存在店铺名。
      const msg = (error as Error).message;
      assert.ok(msg.includes('wx-dup-1'), 'message should mention appId');
      assert.ok(msg.includes('店铺一'), 'message should mention existing name');
      assert.ok(!msg.includes('secret'), 'message must not leak appSecret');
      return true;
    },
  );

  // 库里只允许存在一条该 appId 的记录，且仍是第一条。
  const records = await extensionDb.accounts.where('appId').equals('wx-dup-1').toArray();
  assert.equal(records.length, 1, 'must not create a second record for the same appId');
  assert.equal(records[0].id, first.id);
  assert.equal(records[0].config.appSecret, 'secret-1', 'existing secret must remain untouched');
});

test('addAccount still allows distinct appIds', async () => {
  await resetDb();

  const a = await addAccount('店铺A', { appId: 'app-a', appSecret: 'sa' });
  const b = await addAccount('店铺B', { appId: 'app-b', appSecret: 'sb' });

  assert.notEqual(a.id, b.id);
  assert.equal((await extensionDb.accounts.toArray()).length, 2);
});

test('DuplicateAppIdError is detectable by name for cross-realm errors', async () => {
  // runtime 序列化错误时偶尔会丢失原型链（例如 chrome.runtime 返回的是普通对象），
  // isDuplicateAppIdError 除了 instanceof，还应认 name，保证这类场景仍可识别。
  const err = new DuplicateAppIdError({ appId: 'wx-x' });
  assert.ok(isDuplicateAppIdError(err));
  const plain = new Error('AppID wx-x 已存在');
  plain.name = 'DuplicateAppIdError';
  assert.ok(isDuplicateAppIdError(plain));
  assert.ok(!isDuplicateAppIdError(new Error('其它错误')));
});
