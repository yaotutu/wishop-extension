import type { ActionResult, ActionResultContext, ResultAction, ScanItem } from '../types';
import type { DraftProduct } from '../../../shared/types';
import { deleteOne } from '../../modules/delete-failed-products';

/**
 * 删除处置动作（默认实现）。
 *
 * 对命中的商品执行删除，复用 modules/delete-failed-products.ts 的 deleteOne，
 * 它内部带 1 秒限频和微信 errcode 处理（10020208/10020247 全局限制会返回 stopped）。
 *
 * deleteOne 期望接收 DraftProduct，合规扫描这边只有 ScanItem，
 * 这里构造最小 DraftProduct（deleteOne 实际只用到 productId/title/editStatus，
 * editStatus 给 0 表示非审核失败态，避免误触发「审核失败已自动删除」日志文案）。
 */
export class DeleteResultAction implements ResultAction {
  readonly key = 'delete';

  async apply(item: ScanItem, ctx: ActionResultContext): Promise<ActionResult> {
    const draft: DraftProduct = {
      productId: item.productId,
      title: item.title,
      headImgs: [],
      status: 0,
      editStatus: 0,
    };
    const res = await deleteOne(ctx.api, ctx.addLog, draft, ctx.runId, ctx.accountId);
    return {
      status: res,
      message: res === 'success' ? '已删除' : res === 'stopped' ? '删除触发全局限制，已停止' : '删除失败',
    };
  }
}
