import type { ScannableProduct, ScanSource } from '../types';

/**
 * 上架商品数据源（接口预留，本期不实现）。
 *
 * 实现需要 wxshop 接口拉 status=线上 的商品列表，当前 listing client 没有这个能力。
 * 这里只占位，stream() 直接抛错，避免被误以为已完成。
 * 后期接入上架商品扫描时实现 stream()，前端激活「上架商品」选项。
 */
export class OnlineProductScanSource implements ScanSource {
  readonly key = 'online';

  async *stream(): AsyncGenerator<ScannableProduct> {
    throw new Error('OnlineProductScanSource 尚未实现，仅接口预留');
  }
}
