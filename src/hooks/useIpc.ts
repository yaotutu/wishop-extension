/**
 * 前端 IPC 接入层 barrel。
 *
 * 「复制商品」业务域只需要这些 hook / 类型：
 *  - 账号 / 配置 / 设置
 *  - 活动日志 / 通知
 *  - 商品来源 / 商品复制相关 mutation / query
 *
 * 订单 / 草稿 / 提审 / 调度 / 合规 / 退款 / 发货 相关 hook 已随对应业务域一起删除。
 */
export type {
  Config,
  LogEntry,
  Account,
} from '../shared/types';
export type { ActivityLogEntry } from '../shared/activity-log';
export type { NotificationEntry, NotificationPreference } from '../shared/notification';
export { useAccounts } from './useAccounts';
export { useConfig } from './useConfig';
export { useActivityLogs } from './useActivityLogs';
export { useNotifications } from './useNotifications';
