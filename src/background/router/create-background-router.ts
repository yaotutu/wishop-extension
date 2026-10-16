/**
 * 运行时 channel 路由表。
 *
 * 「复制商品」业务域只用到的 channel 在这里注册为 feature map，
 * 业务实现由各 runtime handler 模块负责。
 *
 * 历史上 routes 还包括订单 / 草稿 / 提审 / 调度 / 合规 / 退款 / 发货 等十几个
 * 模块，全部随业务域删除。
 */
import { createAccountRuntimeHandlers } from '../runtime-handlers/account-handlers';
import { createLogRuntimeHandlers } from '../runtime-handlers/log-handlers';
import { createNotificationRuntimeHandlers } from '../runtime-handlers/notification-handlers';
import { createProductRuntimeHandlers } from '../runtime-handlers/product-handlers';
import { createProductCopyRuntimeHandlers } from '../runtime-handlers/product-copy-handlers';
import { createProductSourceRuntimeHandlers } from '../runtime-handlers/product-source-handlers';
import { createSettingsRuntimeHandlers } from '../runtime-handlers/settings-handlers';
import { createTaobaoLoginRuntimeHandlers } from '../runtime-handlers/taobao-login-handlers';
import { createTaobaoWorkspaceRuntimeHandlers } from '../runtime-handlers/taobao-workspace-handlers';
import { createWxCategoryDataRuntimeHandlers } from '../runtime-handlers/wx-category-data-handlers';
import { createRuntimeRouter, type RuntimeFeatureMap, type RuntimeRouter } from './runtime-router';

const FEATURE_CHANNELS = {
  'accounts:list': null,
  'accounts:add': null,
  'accounts:remove': null,
  'accounts:update': null,
  'accounts:getActive': null,
  'accounts:setActive': null,
  'config:get': null,
  'config:set': null,
  'productSources:list': null,
  'productSources:set': null,
  'productSources:remove': null,
  'products:getQrcode': null,
  'productCopy:list': null,
  'productCopy:remove': null,
  'productCopy:getDraftParameterOptions': null,
  'productCopy:getCreatedProduct': null,
  'productCopy:getDefaultSettings': null,
  'productCopy:saveDefaultSettings': null,
  'productCopy:open': null,
  'productCopy:getCurrentTabSession': null,
  'productCopy:markPageReady': null,
  'productCopy:reportChallenge': null,
  'productCopy:resolveChallenge': null,
  'productCopy:complete': null,
  'productCopy:fail': null,
  'productCopy:suggestWxCategoryFromFullList': null,
  'productCopy:prepareWxDraftBoxProduct': null,
  'productCopy:createPreparedWxDraftBoxProduct': null,
  'productCopy:createWxDraftBoxProduct': null,
  'productCopy:deleteCreatedWxDraftBoxProduct': null,
  'wxCategoryData:downloadProductRules': null,
  'wxCategoryData:getProductRuleCacheStatus': null,
  'taobaoWorkspace:getCurrentRole': null,
  'taobaoLogin:getState': null,
  'taobaoLogin:probeNow': null,
  'taobaoLogin:reportFromContent': null,
  'taobaoLogin:openLoginPage': null,
  'activityLogs:list': null,
  'activityLogs:clear': null,
  'notifications:list': null,
  'notifications:markRead': null,
  'notifications:markAllRead': null,
  'notifications:clear': null,
  'notifications:getPreference': null,
  'notifications:updatePreference': null,
  'settings:get': null,
  'settings:update': null,
  'app:version': null,
};

interface CreateBackgroundRouterOptions {
  getCurrentTabProductCopySession: (sender?: chrome.runtime.MessageSender) => Promise<unknown>;
}

/**
 * Runtime channel registration lives here so handlers.ts remains a thin
 * transport adapter. Feature-level authorization and business behavior stay in
 * each runtime handler or service module.
 */
export function createBackgroundRouter(options: CreateBackgroundRouterOptions): RuntimeRouter {
  return createRuntimeRouter({
    ...createAccountRuntimeHandlers(),
    ...createProductRuntimeHandlers(),
    ...createProductSourceRuntimeHandlers(),
    ...createProductCopyRuntimeHandlers(options.getCurrentTabProductCopySession),
    ...createWxCategoryDataRuntimeHandlers(),
    ...createTaobaoWorkspaceRuntimeHandlers(),
    ...createTaobaoLoginRuntimeHandlers(),
    ...createLogRuntimeHandlers(),
    ...createNotificationRuntimeHandlers(),
    ...createSettingsRuntimeHandlers(),
  });
}
