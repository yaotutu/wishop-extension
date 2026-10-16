/**
 * TanStack Query 的 queryKey 集合。
 *
 * 集中在一处维护，避免各页面写散。值是 readonly 元组，确保引用稳定。
 *
 * 已删除的订单 / 草稿 / 提审 / 调度 / 合规 / 退款 / 发货 相关 key 全部清掉。
 */
export const queryKeys = {
  accounts: {
    list: ['accounts'] as const,
    active: ['accounts', 'active'] as const,
  },
  config: {
    item: (accountId: string) => ['config', accountId] as const,
  },
  productSources: {
    list: (accountId: string) => ['productSources', accountId] as const,
  },
  productCopy: {
    list: ['productCopy', 'list'] as const,
    draftParameterOptions: (accountId: string) => ['productCopy', 'draftParameterOptions', accountId] as const,
    createdProduct: (accountId: string, copyId: string) => ['productCopy', 'createdProduct', accountId, copyId] as const,
    defaultSettings: (accountId: string) => ['productCopy', 'defaultSettings', accountId] as const,
  },
  wxCategoryData: {
    productRuleCacheStatus: ['wxCategoryData', 'productRuleCacheStatus'] as const,
  },
  activityLogs: {
    list: ['activityLogs'] as const,
  },
  appSettings: {
    item: ['appSettings'] as const,
  },
  notifications: {
    list: ['notifications'] as const,
    preference: ['notifications', 'preference'] as const,
  },
};
