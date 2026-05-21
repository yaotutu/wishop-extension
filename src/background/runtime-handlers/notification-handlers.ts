import type { NotificationPreference } from '../../shared/notification';
import type { RuntimeHandlerMap } from '../router/runtime-router';
import {
  clearNotificationCenter,
  getNotificationCenterPreference,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationCenterPreference,
} from '../notification-center/notification-service';

export function createNotificationRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'notifications:list'() {
      return listNotifications();
    },
    async 'notifications:markRead'(args) {
      return markNotificationRead(args[0] as string);
    },
    async 'notifications:markAllRead'() {
      return markAllNotificationsRead();
    },
    async 'notifications:clear'() {
      return clearNotificationCenter();
    },
    async 'notifications:getPreference'() {
      return getNotificationCenterPreference();
    },
    async 'notifications:updatePreference'(args) {
      return updateNotificationCenterPreference(args[0] as Partial<NotificationPreference>);
    },
  };
}
