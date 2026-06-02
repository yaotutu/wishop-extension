import type { ProductAuditTaskConfig } from '../../shared/types';
import { DEFAULT_PRODUCT_AUDIT_CONFIG, normalizeProductAuditTaskConfig } from './core.ts';
import { ensureAccountWorkspace, updateAccountWorkspace } from './workspace-repository.ts';

export async function getProductAuditConfig(accountId: string): Promise<ProductAuditTaskConfig> {
  return normalizeProductAuditTaskConfig((await ensureAccountWorkspace(accountId)).productAuditConfig || DEFAULT_PRODUCT_AUDIT_CONFIG);
}

export async function setProductAuditConfig(accountId: string, productAuditConfig: ProductAuditTaskConfig): Promise<void> {
  await updateAccountWorkspace(accountId, workspace => {
    workspace.productAuditConfig = normalizeProductAuditTaskConfig(productAuditConfig);
  });
}
