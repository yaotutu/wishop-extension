import type { ActionResult, ActionResultContext, ResultAction, ScanItem } from '../types';

/**
 * 导出处置动作（接口预留，本期不实现）。
 *
 * 后续想做「扫描导出报告」而非删除时实现：把命中结果导出成文件。
 * 这里只占位，apply() 直接抛错，避免被误以为已完成。
 */
export class ExportResultAction implements ResultAction {
  readonly key = 'export';

  async apply(_item: ScanItem, _ctx: ActionResultContext): Promise<ActionResult> {
    throw new Error('ExportResultAction 尚未实现，仅接口预留');
  }
}
