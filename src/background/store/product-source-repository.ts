import { v4 as uuidv4 } from 'uuid';
import type { ProductCopyRecord, ProductSourceBinding, ProductSourceItem, WxProductDraftCreationResult } from '../../shared/types';
import { ensureAccountWorkspace, updateAccountWorkspace } from './workspace-repository.ts';

type ProductSourceInput = Pick<ProductSourceItem, 'id' | 'url' | 'quantity' | 'remark' | 'createdAt' | 'updatedAt'>
  & Partial<Pick<ProductSourceItem, 'sourceType' | 'sourcePlatform' | 'sourceItemId' | 'sourceTitle' | 'createdBy'>>;

export async function getProductSources(accountId: string): Promise<ProductSourceBinding[]> {
  return (await ensureAccountWorkspace(accountId)).productSources;
}

export async function setProductSources(
  accountId: string,
  productId: string,
  sources: ProductSourceInput[],
): Promise<ProductSourceBinding> {
  const now = Date.now();
  const normalizedSources: ProductSourceItem[] = sources
    .map(source => ({
      id: source.id || uuidv4(),
      url: source.url.trim(),
      quantity: Number.isFinite(source.quantity) && source.quantity > 0 ? source.quantity : 1,
      remark: source.remark.trim(),
      sourceType: source.sourceType,
      sourcePlatform: source.sourcePlatform,
      sourceItemId: source.sourceItemId?.trim() || undefined,
      sourceTitle: source.sourceTitle?.trim() || undefined,
      createdBy: source.createdBy,
      createdAt: source.createdAt || now,
      updatedAt: now,
    }))
    .filter(source => source.url);
  const binding: ProductSourceBinding = { productId, sources: normalizedSources };

  await updateAccountWorkspace(accountId, workspace => {
    const existing = workspace.productSources || [];
    workspace.productSources = normalizedSources.length > 0
      ? [...existing.filter(item => item.productId !== productId), binding]
      : existing.filter(item => item.productId !== productId);
  });

  return binding;
}

export async function removeProductSource(accountId: string, productId: string, sourceId: string): Promise<ProductSourceBinding> {
  const sources = (await getProductSources(accountId))
    .find(item => item.productId === productId)
    ?.sources
    .filter(source => source.id !== sourceId) || [];
  return setProductSources(accountId, productId, sources);
}

// 复制商品只做商品级货源关联：用户后期查订单时能定位到原淘宝链接。
// SKU 级映射先保留在 source metadata 上，不参与当前淘宝复制流程的业务判断。
export async function addProductCopySourceBinding(
  result: WxProductDraftCreationResult,
  source: ProductCopyRecord,
): Promise<ProductSourceBinding> {
  const existing = (await getProductSources(result.accountId))
    .find(binding => binding.productId === result.productId)
    ?.sources || [];
  const normalizedUrl = source.sourceUrl.trim();
  if (existing.some(item => item.url.trim() === normalizedUrl)) {
    return setProductSources(result.accountId, result.productId, existing);
  }
  return setProductSources(result.accountId, result.productId, [
    ...existing,
    {
      id: '',
      url: normalizedUrl,
      quantity: 1,
      remark: `复制商品自动关联：${source.title}`.slice(0, 120),
      sourceType: 'productCopy',
      sourcePlatform: source.identity.platform,
      sourceItemId: source.identity.itemId,
      sourceTitle: source.title,
      createdBy: 'productCopy',
      createdAt: 0,
      updatedAt: 0,
    },
  ]);
}
