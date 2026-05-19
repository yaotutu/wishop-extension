import { v4 as uuidv4 } from 'uuid';
import type { ProductSourceBinding, ProductSourceItem } from '../../shared/types';
import { getAccount } from './account-repository';
import { updateAccountData } from './core';

export async function getProductSources(accountId: string): Promise<ProductSourceBinding[]> {
  return (await getAccount(accountId))?.productSources || [];
}

export async function setProductSources(
  accountId: string,
  productId: string,
  sources: Array<Pick<ProductSourceItem, 'id' | 'url' | 'quantity' | 'remark' | 'createdAt' | 'updatedAt'>>,
): Promise<ProductSourceBinding> {
  const now = Date.now();
  const normalizedSources: ProductSourceItem[] = sources
    .map(source => ({
      id: source.id || uuidv4(),
      url: source.url.trim(),
      quantity: Number.isFinite(source.quantity) && source.quantity > 0 ? source.quantity : 1,
      remark: source.remark.trim(),
      createdAt: source.createdAt || now,
      updatedAt: now,
    }))
    .filter(source => source.url);
  const binding: ProductSourceBinding = { productId, sources: normalizedSources };

  await updateAccountData(accountId, account => {
    const existing = account.productSources || [];
    account.productSources = normalizedSources.length > 0
      ? [...existing.filter(item => item.productId !== productId), binding]
      : existing.filter(item => item.productId !== productId);
  });

  return binding;
}

export async function removeProductSource(accountId: string, productId: string, sourceId: string): Promise<ProductSourceBinding> {
  const sources = ((await getAccount(accountId))?.productSources || [])
    .find(item => item.productId === productId)
    ?.sources
    .filter(source => source.id !== sourceId) || [];
  return setProductSources(accountId, productId, sources);
}
