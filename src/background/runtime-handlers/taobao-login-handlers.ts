/**
 * 淘宝登录态 IPC handlers：薄层映射，业务逻辑全在 taobao-login-service。
 *
 * 注意：taobao-login 这个能力本身不是 product-copy 业务必须，但它作为 product-copy
 * 链路上的基础设施（product-copy-session-service 内部调用 `requireTaobaoLoggedIn`，
 * content 端用 `reportFromContent` 回报登录态）必须保留。
 *  - getState：读后台内存态快照（O(1)，无副作用）。
 *  - probeNow：触发一次即时探测（导航工作页 + 等 content 回报）。
 *  - reportFromContent：content script 主动回报登录态。
 *  - openLoginPage：打开淘宝登录页供用户登录（前端"去登录"按钮）。
 */
import type { RuntimeHandlerMap } from '../router/runtime-router';
import type { TaobaoLoginSnapshot } from '../../shared/types';
import {
  applyTaobaoLoginReport,
  getTaobaoLoginSnapshot,
  openTaobaoLoginPage,
  probeTaobaoLoginNow,
} from '../taobao-login/taobao-login-service';

export function createTaobaoLoginRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'taobaoLogin:getState'() {
      return getTaobaoLoginSnapshot();
    },
    async 'taobaoLogin:probeNow'() {
      // 用户在 UI 上手动点击复检时触发，结果会通过事件广播。
      return probeTaobaoLoginNow('heartbeat');
    },
    async 'taobaoLogin:reportFromContent'(args: unknown[]) {
      const snapshot = args[0] as TaobaoLoginSnapshot;
      // content 回报：强制 source 标记为 content-report（前端无法伪造来源类型）。
      await applyTaobaoLoginReport({ ...snapshot, source: 'content-report' });
    },
    async 'taobaoLogin:openLoginPage'() {
      await openTaobaoLoginPage();
    },
  };
}
