/**
 * 店铺凭证相关错误的统一类型与判断辅助。
 *
 * 当前只覆盖 AppID 重复这一种业务错误：addAccount 路径在写库前会按 appId 查重，
 * 命中时抛出 DuplicateAppIdError，调用方（runtime handler、批量导入）据此把它
 * 归到「失败条目」并提示用户，而不是静默插入第二条记录。
 *
 * 这里刻意不引入 message 前缀约定（凭证错误那种 `[CREDENTIAL]` 前缀是为了让
 * 上层用字符串匹配判断类型）。店铺新增是本地写操作，调用方更希望拿到结构化
 * 的 appId 字段做精准提示，所以用 instanceof 判断即可。
 */
const DUPLICATE_APPID_NAME = 'DuplicateAppIdError';

export interface DuplicateAppIdErrorInit {
  /** 触发重复的 AppID，供前端精准展示。 */
  appId: string;
  /** 已存在店铺的名称，便于提示用户「已存在名为 X 的店铺」。 */
  existingName?: string;
}

export class DuplicateAppIdError extends Error {
  readonly appId: string;
  readonly existingName?: string;

  constructor(init: DuplicateAppIdErrorInit) {
    // message 不包含任何敏感凭证（appSecret），只有 appId 和可选的店铺名。
    const suffix = init.existingName ? `（已存在店铺「${init.existingName}」）` : '';
    super(`AppID ${init.appId} 已存在${suffix}`);
    this.name = DUPLICATE_APPID_NAME;
    this.appId = init.appId;
    this.existingName = init.existingName;
  }
}

export function isDuplicateAppIdError(error: unknown): error is DuplicateAppIdError {
  return error instanceof DuplicateAppIdError || (error instanceof Error && error.name === DUPLICATE_APPID_NAME);
}
