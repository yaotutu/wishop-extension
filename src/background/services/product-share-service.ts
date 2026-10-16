import type { ProductQrcodeResult } from '../../shared/types';
import { getListingClient } from '../wxshop/client-registry';

/**
 * 商品分享能力集中在 service 层，runtime handler 只负责参数适配。
 * 这样后续如果要增加 H5 短链、商品口令或企业微信归因参数，不需要改 UI 调用链。
 */
export async function getProductQrcode(accountId: string, productId: string): Promise<ProductQrcodeResult> {
  const normalizedProductId = productId.trim();
  if (!normalizedProductId) {
    throw new Error('商品 ID 为空，无法获取商品二维码');
  }

  return (await getListingClient(accountId)).getProductQrcode(normalizedProductId);
}
