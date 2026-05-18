import { useState, useCallback, useRef } from 'react';
import { extensionApi } from '../shared/extension-api';
import type { Order, OrderStatus, OrderSearchParams, OrderAddressInfo } from '../shared/types';
import { useIpcFetch } from './useIpcFetch';
import { isCredentialError } from '../shared/errors';
import { useCredentialError } from '../contexts/CredentialErrorContext';

export function useOrders(accountId: string) {
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { reportCredentialError } = useCredentialError();

  // 用 ref 传递 status 给 fetcher，避免 fetcher 频繁变化导致 fetch 重建
  const statusRef = useRef<OrderStatus | undefined>(undefined);

  const { data: orders, loading, fetch, setData: setOrders } = useIpcFetch<Order[]>(
    accountId,
    useCallback(async () => {
      const result = await extensionApi.orders.list(accountId, statusRef.current);
      setHasMore(result.hasMore);
      return result.orders;
    }, [accountId]),
    [],
    { autoFetch: false },
  );

  // 竞态保护：请求版本号，忽略过期响应
  const fetchIdRef = useRef(0);

  const fetchOrders = useCallback(async (status?: OrderStatus, append = false) => {
    if (!accountId) return;
    const fetchId = ++fetchIdRef.current;
    setError(null);

    if (!append) {
      // 全量刷新：走 useIpcFetch.fetch()，loading 状态正确更新
      statusRef.current = status;
      try {
        await fetch();
      } catch (err: any) {
        if (fetchIdRef.current !== fetchId) return;
        if (isCredentialError(err)) reportCredentialError(err);
        setError(err.message || '获取订单列表失败');
      }
    } else {
      // 追加加载：直接 IPC，不更新 loading
      try {
        const result = await extensionApi.orders.list(accountId, status);
        if (fetchIdRef.current !== fetchId) return;
        setOrders(prev => [...prev, ...result.orders]);
        setHasMore(result.hasMore);
      } catch (err: any) {
        if (fetchIdRef.current !== fetchId) return;
        if (isCredentialError(err)) reportCredentialError(err);
        setError(err.message || '获取订单列表失败');
      }
    }
  }, [accountId, fetch, setOrders]);

  const fetchOrderDetail = useCallback(async (orderId: string): Promise<Order | null> => {
    try {
      return await extensionApi.orders.detail(accountId, orderId);
    } catch (err: any) {
      if (isCredentialError(err)) reportCredentialError(err);
      setError(err.message || '获取订单详情失败');
      return null;
    }
  }, [accountId, reportCredentialError]);

  const searchOrders = useCallback(async (params: OrderSearchParams) => {
    if (!accountId) return;
    const fetchId = ++fetchIdRef.current;
    setError(null);
    try {
      const result = await extensionApi.orders.search(accountId, params);
      if (fetchIdRef.current !== fetchId) return;
      setOrders(result.orders);
      setHasMore(result.hasMore);
    } catch (err: any) {
      if (fetchIdRef.current !== fetchId) return;
      if (isCredentialError(err)) reportCredentialError(err);
      setError(err.message || '搜索订单失败');
    }
  }, [accountId, setOrders, reportCredentialError]);

  const decodeAddress = useCallback(async (orderId: string): Promise<OrderAddressInfo | null> => {
    try {
      return await extensionApi.orders.decodeAddress(accountId, orderId);
    } catch (err: any) {
      if (isCredentialError(err)) reportCredentialError(err);
      setError(err.message || '解密收货信息失败');
      return null;
    }
  }, [accountId, reportCredentialError]);

  const clearError = useCallback(() => setError(null), []);

  return { orders, hasMore, loading, error, clearError, fetchOrders, fetchOrderDetail, searchOrders, decodeAddress };
}
