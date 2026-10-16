/**
 * 店小七 Chrome 扩展的后台 Service Worker 入口。
 *
 * 当前只承载「复制商品」一个业务域，所以这里只安装与该域相关的：
 *  - runtime IPC 处理器（productCopy / productSource / product / account / log / notification / settings / wxCategoryData / activityLogs）
 *  - 复制商品会话的 tab 清理监听
 *  - 淘宝工作台 tab 清理监听（用于关闭商品采集工作台页时回收）
 *  - 数据迁移（启动时跑一次，让旧用户的 store schema 升级到当前最小集）
 *
 * 定时任务、心跳、订单/退款/发货等其他域相关的初始化已经全部移除。
 */
import { installRuntimeHandlers } from '../src/background/handlers';
import { installProductCopyTabCleanup } from '../src/background/services/product-copy-session-service';
import { migrateStore } from '../src/background/store';
import { installTaobaoWorkTabCleanup } from '../src/background/taobao-workspace/work-tab-service';

export default defineBackground(() => {
  // 注册 IPC：所有前端请求都从这一份路由表分发。
  installRuntimeHandlers();

  // 关闭淘宝工作台/复制商品工作台时回收内存里的会话状态。
  installProductCopyTabCleanup();
  installTaobaoWorkTabCleanup();

  // 启动时迁移一次 store schema（幂等）。保留这个 hook 是为了让旧用户升级时不至于读到缺失字段。
  void migrateStore();

  // 点击扩展图标时唤起 dashboard。
  chrome.action.onClicked.addListener(async () => {
    const dashboardUrl = chrome.runtime.getURL('/dashboard.html');
    const tabs = await chrome.tabs.query({ url: dashboardUrl });
    if (tabs[0]?.id) {
      await chrome.tabs.update(tabs[0].id, { active: true });
      if (tabs[0].windowId) await chrome.windows.update(tabs[0].windowId, { focused: true });
      return;
    }
    await chrome.tabs.create({ url: dashboardUrl });
  });
});
