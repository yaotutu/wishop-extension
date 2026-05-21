import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import { extensionApi } from '../shared/extension-api';
import type { NotificationEntry, NotificationPreference } from '../shared/notification';
import { DEFAULT_NOTIFICATION_PREFERENCE } from '../shared/notification';
import { queryKeys } from '../query/query-keys';

export function useNotifications() {
  const queryClient = useQueryClient();
  const notificationsQuery = useQuery({
    queryKey: queryKeys.notifications.list,
    queryFn: () => extensionApi.notifications.list(),
  });
  const preferenceQuery = useQuery({
    queryKey: queryKeys.notifications.preference,
    queryFn: () => extensionApi.notifications.getPreference(),
    initialData: DEFAULT_NOTIFICATION_PREFERENCE,
  });

  useEffect(() => extensionApi.notifications.onAdded((notification) => {
    queryClient.setQueryData<NotificationEntry[]>(queryKeys.notifications.list, (current = []) => [...current, notification].slice(-200));
    if (notification.level === 'error') {
      message.error(notification.title);
    } else if (notification.level === 'warning') {
      message.warning(notification.title);
    }
  }), [queryClient]);

  useEffect(() => extensionApi.notifications.onChanged((next) => {
    queryClient.setQueryData(queryKeys.notifications.list, next);
  }), [queryClient]);

  useEffect(() => extensionApi.notifications.onPreferenceChanged((next) => {
    queryClient.setQueryData(queryKeys.notifications.preference, next);
  }), [queryClient]);

  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) => extensionApi.notifications.markRead(notificationId),
    onSuccess: (next) => queryClient.setQueryData(queryKeys.notifications.list, next),
  });
  const markAllReadMutation = useMutation({
    mutationFn: () => extensionApi.notifications.markAllRead(),
    onSuccess: (next) => queryClient.setQueryData(queryKeys.notifications.list, next),
  });
  const clearMutation = useMutation({
    mutationFn: () => extensionApi.notifications.clear(),
    onSuccess: () => queryClient.setQueryData<NotificationEntry[]>(queryKeys.notifications.list, []),
  });
  const updatePreferenceMutation = useMutation({
    mutationFn: (patch: Partial<NotificationPreference>) => extensionApi.notifications.updatePreference(patch),
    onSuccess: (next) => queryClient.setQueryData(queryKeys.notifications.preference, next),
  });

  const fetchNotifications = useCallback(async () => queryClient.fetchQuery({
    queryKey: queryKeys.notifications.list,
    queryFn: () => extensionApi.notifications.list(),
  }), [queryClient]);

  const fetchPreference = useCallback(async () => queryClient.fetchQuery({
    queryKey: queryKeys.notifications.preference,
    queryFn: () => extensionApi.notifications.getPreference(),
  }), [queryClient]);

  const markRead = useCallback(async (notificationId: string) => {
    await markReadMutation.mutateAsync(notificationId);
  }, [markReadMutation]);

  const markAllRead = useCallback(async () => {
    await markAllReadMutation.mutateAsync();
  }, [markAllReadMutation]);

  const clearNotifications = useCallback(async () => {
    await clearMutation.mutateAsync();
  }, [clearMutation]);

  const updatePreference = useCallback(async (patch: Partial<NotificationPreference>) => {
    await updatePreferenceMutation.mutateAsync(patch);
  }, [updatePreferenceMutation]);

  return {
    notifications: notificationsQuery.data ?? [],
    preference: preferenceQuery.data,
    loading: notificationsQuery.isLoading,
    fetchNotifications,
    fetchPreference,
    markRead,
    markAllRead,
    clearNotifications,
    updatePreference,
  };
}
