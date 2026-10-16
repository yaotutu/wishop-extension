/**
 * 全局 IPC channel 协议。
 *
 * 「复制商品」业务域只声明这一份 channel 集合，由 src/shared/extension-api.ts 暴露给前端
 * 调用。任何新增 channel 都必须先在 productCopy* / productSources* / wxCategoryData*
 * / accounts* / config* / taobaoWorkspace* / taobaoLogin* / activityLogs* /
 * notifications* / settings* / app:* 命名空间下加。
 *
 * 已删除的订单 / 草稿 / 提审 / 调度 / 合规 / 退款 / 发货 / 鉴权 / 违规词 相关 channel 不再
 * 在这里声明。
 */
import type { ActivityLogEntry } from './activity-log';
import type { NotificationEntry, NotificationPreference } from './notification';
import type { AppSettings, AppSettingsPatch } from './settings';
import type {
  Account,
  ProductCopyCreatedProductRecord,
  ProductCopyDefaultSettings,
  ProductCopyDefaultSettingsPatch,
  ProductCopyDraftParameterOptions,
  ProductCopyRecord,
  Config,
  CreatePreparedWxDraftBoxProductInput,
  CreateProductCopySessionInput,
  CreateWxDraftBoxProductInput,
  CreateWxDraftBoxProductPrepareInput,
  CreateWxProductDraftSuggestionInput,
  DeleteCreatedWxDraftBoxProductInput,
  DeleteCreatedWxDraftBoxProductResult,
  LogEntry,
  ProductSourceBinding,
  ProductSourceItem,
  ProductQrcodeResult,
  ProductCopySession,
  SyncWxCategoryProductRulesInput,
  TaobaoProductSnapshot,
  TaobaoSecurityChallengeSnapshot,
  TaobaoLoginSnapshot,
  TaobaoWorkspaceRole,
  WxDraftBoxProductPrepareResult,
  WxProductDraftSuggestionResult,
  WxProductDraftCreationResult,
  SyncWxCategoryProductRulesResult,
  WxCategoryProductRuleCacheStatus,
} from './types';

export interface RuntimeChannels {
  'accounts:list': { args: []; result: Account[] };
  'accounts:add': { args: [name: string, config: Config]; result: Account };
  'accounts:remove': { args: [accountId: string]; result: void };
  'accounts:update': { args: [accountId: string, patch: Partial<Pick<Account, 'name' | 'config'>>]; result: void };
  'accounts:getActive': { args: []; result: string };
  'accounts:setActive': { args: [accountId: string]; result: void };
  'config:get': { args: [accountId: string]; result: Config };
  'config:set': { args: [accountId: string, config: Config]; result: { success: boolean; error?: string } };

  'productSources:list': { args: [accountId: string]; result: ProductSourceBinding[] };
  'productSources:set': { args: [accountId: string, productId: string, sources: ProductSourceItem[]]; result: ProductSourceBinding };
  'productSources:remove': { args: [accountId: string, productId: string, sourceId: string]; result: ProductSourceBinding };
  'products:getQrcode': { args: [accountId: string, productId: string]; result: ProductQrcodeResult };

  'productCopy:list': { args: []; result: ProductCopyRecord[] };
  'productCopy:remove': { args: [copyId: string]; result: void };
  'productCopy:getDraftParameterOptions': { args: [accountId: string]; result: ProductCopyDraftParameterOptions };
  'productCopy:getCreatedProduct': { args: [accountId: string, copyId: string]; result: ProductCopyCreatedProductRecord | null };
  'productCopy:getDefaultSettings': { args: [accountId: string]; result: ProductCopyDefaultSettings };
  'productCopy:saveDefaultSettings': { args: [accountId: string, patch: ProductCopyDefaultSettingsPatch]; result: ProductCopyDefaultSettings };
  'productCopy:open': { args: [input: CreateProductCopySessionInput]; result: ProductCopySession };
  'productCopy:getCurrentTabSession': { args: []; result: ProductCopySession | null };
  'productCopy:markPageReady': { args: [sessionId: string]; result: ProductCopySession };
  'productCopy:reportChallenge': { args: [sessionId: string, snapshot: TaobaoSecurityChallengeSnapshot]; result: ProductCopySession };
  'productCopy:resolveChallenge': { args: [sessionId: string]; result: ProductCopySession };
  'productCopy:complete': { args: [sessionId: string, snapshot: TaobaoProductSnapshot]; result: ProductCopyRecord };
  'productCopy:fail': { args: [sessionId: string, error: string]; result: ProductCopySession };
  'productCopy:suggestWxCategoryFromFullList': { args: [input: CreateWxProductDraftSuggestionInput]; result: WxProductDraftSuggestionResult };
  'productCopy:prepareWxDraftBoxProduct': { args: [input: CreateWxDraftBoxProductPrepareInput]; result: WxDraftBoxProductPrepareResult };
  'productCopy:createPreparedWxDraftBoxProduct': { args: [input: CreatePreparedWxDraftBoxProductInput]; result: WxProductDraftCreationResult };
  'productCopy:createWxDraftBoxProduct': { args: [input: CreateWxDraftBoxProductInput]; result: WxProductDraftCreationResult };
  'productCopy:deleteCreatedWxDraftBoxProduct': { args: [input: DeleteCreatedWxDraftBoxProductInput]; result: DeleteCreatedWxDraftBoxProductResult };

  'wxCategoryData:downloadProductRules': { args: [input: SyncWxCategoryProductRulesInput]; result: SyncWxCategoryProductRulesResult };
  'wxCategoryData:getProductRuleCacheStatus': { args: []; result: WxCategoryProductRuleCacheStatus };

  'taobaoWorkspace:getCurrentRole': { args: []; result: TaobaoWorkspaceRole | null };

  /** 淘宝登录态：getState 读内存态、probeNow 触发一次即时探测、reportFromContent 由 content 主动回报。 */
  'taobaoLogin:getState': { args: []; result: TaobaoLoginSnapshot };
  'taobaoLogin:probeNow': { args: []; result: TaobaoLoginSnapshot };
  'taobaoLogin:reportFromContent': { args: [snapshot: TaobaoLoginSnapshot]; result: void };
  'taobaoLogin:openLoginPage': { args: []; result: void };

  'activityLogs:list': { args: []; result: ActivityLogEntry[] };
  'activityLogs:clear': { args: []; result: void };
  'notifications:list': { args: []; result: NotificationEntry[] };
  'notifications:markRead': { args: [notificationId: string]; result: NotificationEntry[] };
  'notifications:markAllRead': { args: []; result: NotificationEntry[] };
  'notifications:clear': { args: []; result: void };
  'notifications:getPreference': { args: []; result: NotificationPreference };
  'notifications:updatePreference': { args: [patch: Partial<NotificationPreference>]; result: NotificationPreference };
  'settings:get': { args: []; result: AppSettings };
  'settings:update': { args: [patch: AppSettingsPatch]; result: AppSettings };

  'app:version': { args: []; result: string };
}

export type RuntimeChannel = keyof RuntimeChannels;
export type RuntimeArgs<K extends RuntimeChannel> = RuntimeChannels[K]['args'];
export type RuntimeResult<K extends RuntimeChannel> = RuntimeChannels[K]['result'];

// 抑制未使用变量警告：LogEntry / Account 仍然是 service 层常用的 payload 类型。
type _KeepUsed = LogEntry | Account;
