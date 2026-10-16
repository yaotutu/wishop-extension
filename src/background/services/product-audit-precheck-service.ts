import type {
  ProductAuditCategoryPrecheckInput,
  ProductAuditCategoryPrecheckResult,
} from '../../shared/types.ts';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';
import type { WxShopListingClient } from '../wxshop/listing/types.ts';

interface ProductAuditPrecheckDependencies {
  getClient?: (accountId: string) => Promise<WxShopListingClient>;
}

function normalizeInput(input: ProductAuditCategoryPrecheckInput): ProductAuditCategoryPrecheckInput {
  const accountId = input.accountId.trim();
  const catId = input.catId.trim();
  if (!accountId) throw new Error('缺少微信小店账号 ID');
  if (!/^\d+$/u.test(catId)) throw new Error('缺少有效的微信小店叶子类目 ID');
  return { accountId, catId };
}

async function defaultGetClient(accountId: string): Promise<WxShopListingClient> {
  const registry = await import('../wxshop/client-registry.ts');
  return registry.getListingClient(accountId);
}

export async function precheckCategoryForProductAudit(
  rawInput: ProductAuditCategoryPrecheckInput,
  dependencies: ProductAuditPrecheckDependencies = {},
): Promise<ProductAuditCategoryPrecheckResult> {
  const input = normalizeInput(rawInput);
  const logger = createDiagnosticLogger({
    domain: 'productAudit',
    component: 'CategoryPrecheck',
    accountId: input.accountId,
  });
  const getClient = dependencies.getClient || defaultGetClient;

  logger.info('开始执行商品提审前类目校验', { catId: input.catId });
  const precheck = await (await getClient(input.accountId)).precheckProductCategory(input.catId);
  logger.info('商品提审前类目校验完成', {
    catId: input.catId,
    allPass: precheck.allPass,
    failReasonCount: precheck.failReasons.length,
  });

  return {
    accountId: input.accountId,
    catId: precheck.catId,
    allPass: precheck.allPass,
    failReasons: precheck.failReasons,
    checkedAt: Date.now(),
  };
}
