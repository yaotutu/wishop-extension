import { useCallback, useEffect } from 'react';
import { message } from 'antd';
import { extensionApi } from '../shared/extension-api';
import type { NotificationEntry, NotificationPreference } from '../shared/notification';
import { DEFAULT_NOTIFICATION_PREFERENCE } from '../shared/notification';
import { useIpcFetch } from './useIpcFetch';

export function useNotifications() {
  const {
    data: notifications,
    loading,
    fetch: fetchNotifications,
    setData: setNotifications,
  } = useIpcFetch<NotificationEntry[]>(
    'notifications',
    useCallback(async () => extensionApi.notifications.list(), []),
    [],
  );
  const {
    data: preference,
    fetch: fetchPreference,
    setData: setPreference,
  } = useIpcFetch<NotificationPreference>(
    'notificationPreference',
    useCallback(async () => extensionApi.notifications.getPreference(), []),
    DEFAULT_NOTIFICATION_PREFERENCE,
  );

  useEffect(() => extensionApi.notifications.onAdded((notification) => {
    setNotifications(prev => [...prev, notification].slice(-200));
    if (notification.level === 'error') {
      message.error(notification.title);
    } else if (notification.level === 'warning') {
      message.warning(notification.title);
    }
  }), [setNotifications]);

  useEffect(() => extensionApi.notifications.onChanged((next) => {
    setNotifications(next);
  }), [setNotifications]);

  useEffect(() => extensionApi.notifications.onPreferenceChanged((next) => {
    setPreference(next);
  }), [setPreference]);

  const markRead = useCallback(async (notificationId: string) => {
    setNotifications(await extensionApi.notifications.markRead(notificationId));
  }, [setNotifications]);

  const markAllRead = useCallback(async () => {
    setNotifications(await extensionApi.notifications.markAllRead());
  }, [setNotifications]);

  const clearNotifications = useCallback(async () => {
    await extensionApi.notifications.clear();
    setNotifications([]);
  }, [setNotifications]);

  const updatePreference = useCallback(async (patch: Partial<NotificationPreference>) => {
    setPreference(await extensionApi.notifications.updatePreference(patch));
  }, [setPreference]);

  return {
    notifications,
    preference,
    loading,
    fetchNotifications,
    fetchPreference,
    markRead,
    markAllRead,
    clearNotifications,
    updatePreference,
  };
}
