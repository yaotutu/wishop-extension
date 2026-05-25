import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Table, Button, Empty, Modal, Select, message } from 'antd';
import {
  useFetchRealAddressMutation,
  useOrderAssociationsQuery,
  useOrderDetailQuery,
  useOrderSyncStateQuery,
  useOrdersQuery,
  useProductSourcesQuery,
  useRealAddressCachesQuery,
  useRefreshOrdersMutation,
  useSaveOrderAssociationMutation,
  useSaveProductSourcesMutation,
  useShipOrderFromPurchaseMutation,
} from '../../hooks/useIpc';
import { extensionApi } from '../../shared/extension-api';
import { OrderStatus as OrderStatusEnum } from '../../shared/types';
import type { Account, DeliveryCompanyOption, Order, OrderScope, OrderSearchSource, OrderStatus, OrderProductInfo, OrderSearchParams, OrderRealAddressCache, OrderAssociation, ProductSourceItem, OrderTimeScope, TaobaoRefundSession } from '../../shared/types';
import { getDeliveryCompanyUnmatchedMessage, isDeliveryCompanyUnmatchedError } from '../../shared/errors';
import { formatOrderAddressForCopy } from '../../shared/address-format';
import { newProductSourceRow, ShippingSourceModal, SourceManagementModal } from './components/ProductSourceModals';
import { OrderDetailModal } from './components/OrderDetailModal';
import { createOrderColumns, type OrderTableRecord } from './components/OrderTableColumns';
import { OrderToolbar } from './components/OrderToolbar';
import { OrderAssociationModal } from './components/OrderAssociationModal';
import { getEstimatedCommissionFee } from './order-display';
import { hasLinkedPurchaseLogistics, isLinkedPurchaseRefundFinished } from './purchase-refund';

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function convertImageBlobToPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法读取图片');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(result => {
      if (result) resolve(result);
      else reject(new Error('图片转换失败'));
    }, 'image/png');
  });
}

function scopedKey(accountId: string, id: string): string {
  return `${accountId}:${id}`;
}

const Orders: React.FC<{ scope: OrderScope; accounts: Account[] }> = ({ scope, accounts }) => {
  const accountNameById = useMemo(() => new Map(accounts.map(account => [account.id, account.name])), [accounts]);
  const accountIds = useMemo(
    () => scope.type === 'all' ? accounts.map(account => account.id) : [scope.accountId],
    [accounts, scope],
  );
  const accountIdSet = useMemo(() => new Set(accountIds), [accountIds]);
  const [activeStatus, setActiveStatus] = useState<OrderStatus | undefined>(undefined);
  const [timeScope, setTimeScope] = useState<OrderTimeScope>('all');
  const [searchType, setSearchType] = useState<OrderSearchParams['search_type']>('order_id');
  const [searchSource, setSearchSource] = useState<OrderSearchSource>('local');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [activeSearch, setActiveSearch] = useState<OrderSearchParams | null>(null);
  const [hiddenError, setHiddenError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailAccountId, setDetailAccountId] = useState('');
  const [detailOrderId, setDetailOrderId] = useState('');
  const [decodingOrderIds, setDecodingOrderIds] = useState<Set<string>>(new Set());
  const [associationModalOpen, setAssociationModalOpen] = useState(false);
  const [associationOrder, setAssociationOrder] = useState<OrderTableRecord | null>(null);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [sourceProduct, setSourceProduct] = useState<OrderProductInfo | null>(null);
  const [sourceRows, setSourceRows] = useState<ProductSourceItem[]>([]);
  const [shipSourceModalOpen, setShipSourceModalOpen] = useState(false);
  const [shipSourceOrder, setShipSourceOrder] = useState<OrderTableRecord | null>(null);
  const [shipSourceProduct, setShipSourceProduct] = useState<OrderProductInfo | null>(null);
  const [checkingPurchaseOrderIds, setCheckingPurchaseOrderIds] = useState<Set<string>>(new Set());
  const [shippingFromPurchaseOrderIds, setShippingFromPurchaseOrderIds] = useState<Set<string>>(new Set());
  const [preparingTaobaoRefundOrderIds, setPreparingTaobaoRefundOrderIds] = useState<Set<string>>(new Set());
  const tableAreaRef = useRef<HTMLDivElement>(null);
  const refundSyncTimerIdsRef = useRef<number[]>([]);
  const initialRefreshStartedRef = useRef<Set<string>>(new Set());
  const [scrollY, setScrollY] = useState(400);
  const ordersQuery = useOrdersQuery(scope, activeStatus, activeSearch, timeScope, searchSource);
  const syncStateQuery = useOrderSyncStateQuery(scope);
  const refreshOrdersMutation = useRefreshOrdersMutation(scope);
  const detailQuery = useOrderDetailQuery(detailAccountId, detailOrderId);
  const productSourcesQuery = useProductSourcesQuery(accountIds);
  const orderAssociationsQuery = useOrderAssociationsQuery(accountIds);
  const refetchOrderAssociations = orderAssociationsQuery.refetch;
  const realAddressCachesQuery = useRealAddressCachesQuery(accountIds);
  const saveProductSourcesMutation = useSaveProductSourcesMutation();
  const saveOrderAssociationMutation = useSaveOrderAssociationMutation();
  const shipOrderFromPurchaseMutation = useShipOrderFromPurchaseMutation();
  const fetchRealAddressMutation = useFetchRealAddressMutation();
  const orders = useMemo<OrderTableRecord[]>(() => ordersQuery.orders.map(snapshot => ({
    ...snapshot.order,
    accountId: snapshot.accountId,
    accountName: snapshot.accountName || accountNameById.get(snapshot.accountId) || snapshot.accountId,
  })), [accountNameById, ordersQuery.orders]);
  const hasMore = ordersQuery.hasMore;
  const loading = ordersQuery.loading;
  const productSources = productSourcesQuery.data || {};
  const orderAssociations = orderAssociationsQuery.data || {};
  const realAddressCaches = realAddressCachesQuery.data || {};
  const orderError = ordersQuery.error instanceof Error ? ordersQuery.error.message : '';
  const visibleError = refreshError || orderError;
  const error = visibleError && visibleError !== hiddenError ? visibleError : null;
  const scopeKey = scope.type === 'all' ? 'all' : `account:${scope.accountId}`;

  const scheduleTaobaoRefundStatusSync = useCallback((session: TaobaoRefundSession) => {
    message.success('淘宝退款申请已自动提交，稍后同步淘宝订单状态');
    const timer = window.setTimeout(() => {
      const key = scopedKey(session.accountId, session.orderId);
      setCheckingPurchaseOrderIds(previous => new Set(previous).add(key));
      extensionApi.purchaseLookup.open({
        accountId: session.accountId,
        orderId: session.orderId,
        platformOrderId: session.platformOrderId,
      })
        .then(syncSession => {
          message.success(syncSession.status === 'queued' ? '淘宝订单状态同步已排队' : '已开始同步淘宝订单状态');
        })
        .catch((err: any) => {
          setCheckingPurchaseOrderIds(previous => {
            const next = new Set(previous);
            next.delete(key);
            return next;
          });
          message.error(`同步淘宝订单状态失败: ${err.message}`);
        });
    }, 4000);
    refundSyncTimerIdsRef.current.push(timer);
  }, []);

  useEffect(() => {
    const el = tableAreaRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      if (h > 0) setScrollY(Math.max(100, h - 39));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setActiveStatus(undefined);
    setTimeScope('all');
    setActiveSearch(null);
    setSearchKeyword('');
    setRefreshError('');
    setDetailAccountId('');
    setDetailOrderId('');
  }, [scope]);

  useEffect(() => {
    if (!syncStateQuery.isSuccess) return;
    if (ordersQuery.isLoading || ordersQuery.isFetching || refreshOrdersMutation.isPending || syncStateQuery.data?.running) return;
    if (orders.length > 0 || syncStateQuery.data?.lastFinishedAt || initialRefreshStartedRef.current.has(scopeKey)) return;
    initialRefreshStartedRef.current.add(scopeKey);
    refreshOrdersMutation.mutate(undefined, {
      onSuccess: () => {
        void ordersQuery.refetch();
      },
      onError: (err: any) => message.error(`订单首次同步失败: ${err.message}`),
    });
  }, [
    orders.length,
    ordersQuery,
    refreshOrdersMutation,
    scopeKey,
    syncStateQuery.data,
    syncStateQuery.isSuccess,
  ]);

  useEffect(() => {
    const errors = [
      ['加载货源失败', productSourcesQuery.error],
      ['加载订单关联失败', orderAssociationsQuery.error],
      ['加载真实地址缓存失败，请在扩展管理页重新加载插件后再试', realAddressCachesQuery.error],
      ['加载订单详情失败', detailQuery.error],
    ] as const;
    errors.forEach(([prefix, err]) => {
      if (err instanceof Error) message.error(`${prefix}: ${err.message}`);
    });
  }, [productSourcesQuery.error, orderAssociationsQuery.error, realAddressCachesQuery.error, detailQuery.error]);

  useEffect(() => {
    const offCompleted = extensionApi.purchaseLookup.onCompleted((association) => {
      setCheckingPurchaseOrderIds(previous => {
        const next = new Set(previous);
        for (const accountId of accountIds) next.delete(scopedKey(accountId, association.orderId));
        return next;
      });
      void refetchOrderAssociations();
      message.success('淘宝订单信息已回填到采购单详情');
    });
    const offFailed = extensionApi.purchaseLookup.onFailed((payload) => {
      if (!accountIdSet.has(payload.accountId)) return;
      setCheckingPurchaseOrderIds(previous => {
        const next = new Set(previous);
        next.delete(scopedKey(payload.accountId, payload.orderId));
        return next;
      });
      message.error(`淘宝订单读取失败: ${payload.error}`);
    });
    const offChallenge = extensionApi.purchaseLookup.onChallenge((payload) => {
      if (!accountIdSet.has(payload.accountId)) return;
      message.warning(`淘宝工作页需要处理验证: ${payload.reason}`);
    });
    const offRefundPrepared = extensionApi.taobaoRefund.onPrepared((session) => {
      if (!accountIdSet.has(session.accountId)) return;
      setPreparingTaobaoRefundOrderIds(previous => {
        const next = new Set(previous);
        next.delete(scopedKey(session.accountId, session.orderId));
        return next;
      });
      message.success('淘宝退款页已选择“不想要了”，请人工确认后手动提交');
    });
    const offRefundSubmitted = extensionApi.taobaoRefund.onSubmitted((session) => {
      if (!accountIdSet.has(session.accountId)) return;
      setPreparingTaobaoRefundOrderIds(previous => {
        const next = new Set(previous);
        next.delete(scopedKey(session.accountId, session.orderId));
        return next;
      });
      scheduleTaobaoRefundStatusSync(session);
    });
    const offRefundFailed = extensionApi.taobaoRefund.onFailed((payload) => {
      if (!accountIdSet.has(payload.accountId)) return;
      setPreparingTaobaoRefundOrderIds(previous => {
        const next = new Set(previous);
        next.delete(scopedKey(payload.accountId, payload.orderId));
        return next;
      });
      message.error(`淘宝退款申请准备失败: ${payload.error}`);
    });
    const offRefundChallenge = extensionApi.taobaoRefund.onChallenge((payload) => {
      if (!accountIdSet.has(payload.accountId)) return;
      message.warning(`淘宝退款页需要处理验证: ${payload.reason}`);
    });
    const offShippingAssociated = extensionApi.shipping.onPurchaseAssociated((payload) => {
      if (!accountIdSet.has(payload.session.accountId)) return;
      void refetchOrderAssociations();
      message.success(`淘宝订单已关联：${payload.session.linkedPlatformOrderId || '-'}`);
    });
    const offShippingFailed = extensionApi.shipping.onPurchaseAssociationFailed((session) => {
      if (!accountIdSet.has(session.accountId)) return;
      message.error(session.purchaseAssociationMessage || '淘宝订单自动关联失败');
    });
    return () => {
      offCompleted();
      offFailed();
      offChallenge();
      offRefundPrepared();
      offRefundSubmitted();
      offRefundFailed();
      offRefundChallenge();
      offShippingAssociated();
      offShippingFailed();
      refundSyncTimerIdsRef.current.forEach(timer => window.clearTimeout(timer));
      refundSyncTimerIdsRef.current = [];
    };
  }, [accountIdSet, accountIds, refetchOrderAssociations, scheduleTaobaoRefundStatusSync]);

  const handleStatusChange = useCallback((val: string | number | null) => {
    if (val === null) return;
    const status = val === 'all' ? undefined : val as OrderStatus;
    setActiveStatus(status);
    setSearchKeyword('');
    setActiveSearch(null);
    setHiddenError('');
  }, []);

  const handleTimeScopeChange = useCallback((value: OrderTimeScope) => {
    setTimeScope(value);
    setHiddenError('');
  }, []);

  const handleSearch = useCallback((value: string) => {
    const keyword = value?.trim();
    setHiddenError('');
    if (!keyword) {
      setActiveSearch(null);
      return;
    }
    setActiveSearch({ search_type: searchType, keyword });
  }, [searchType]);

  const handleLoadMore = useCallback(() => {
    void ordersQuery.fetchNextPage();
  }, [ordersQuery]);

  const handleViewDetail = useCallback((order: OrderTableRecord) => {
    setDetailModalOpen(true);
    setDetailAccountId(order.accountId);
    setDetailOrderId(order.order_id);
  }, []);

  const handleDecodeAddress = useCallback(async (order: OrderTableRecord) => {
    const key = scopedKey(order.accountId, order.order_id);
    setDecodingOrderIds(prev => new Set(prev).add(key));
    try {
      const cache = await fetchRealAddressMutation.mutateAsync({ accountId: order.accountId, orderId: order.order_id, refresh: false });
      if (cache) {
        const text = formatOrderAddressForCopy(cache.address);
        navigator.clipboard.writeText(text).then(() => message.success('真实地址已显示并复制')).catch(() => message.success('真实地址已显示'));
      }
    } catch (err: any) {
      message.error(`获取真实地址失败: ${err.message}`);
    } finally {
      setDecodingOrderIds(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  }, [fetchRealAddressMutation]);

  const handleRefreshAddress = useCallback(async (order: OrderTableRecord) => {
    const key = scopedKey(order.accountId, order.order_id);
    setDecodingOrderIds(prev => new Set(prev).add(key));
    try {
      await fetchRealAddressMutation.mutateAsync({ accountId: order.accountId, orderId: order.order_id, refresh: true });
      message.success('真实地址已刷新');
    } catch (err: any) {
      message.error(`刷新真实地址失败: ${err.message}`);
    } finally {
      setDecodingOrderIds(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  }, [fetchRealAddressMutation]);

  const handleCopyAddress = useCallback((cache: OrderRealAddressCache) => {
    const text = formatOrderAddressForCopy(cache.address);
    navigator.clipboard.writeText(text).then(() => message.success('地址已复制')).catch(() => {});
  }, []);

  const handleCopyText = useCallback((text: string | undefined, label: string) => {
    const value = text?.trim();
    if (!value) {
      message.warning(`暂无${label}`);
      return;
    }
    navigator.clipboard.writeText(value).then(() => message.success(`${label}已复制`)).catch(() => message.error(`复制${label}失败`));
  }, []);

  const handleCopyImage = useCallback(async (imageUrl?: string) => {
    const url = imageUrl?.trim();
    if (!url) {
      message.warning('暂无商品图片');
      return;
    }
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`图片下载失败: ${response.status}`);
      const blob = await response.blob();
      const pngBlob = blob.type === 'image/png' ? blob : await convertImageBlobToPng(blob);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      message.success('图片已复制');
    } catch {
      await navigator.clipboard.writeText(url);
      message.warning('图片复制受限，已复制图片链接');
    }
  }, []);

  const openSourceManager = useCallback((order: OrderTableRecord, product: OrderProductInfo) => {
    setSourceAccountId(order.accountId);
    setSourceProduct(product);
    const sources = (productSources[scopedKey(order.accountId, product.product_id)] || []).map(source => ({ ...source }));
    setSourceRows(sources.length > 0 ? sources : [newProductSourceRow()]);
    setSourceModalOpen(true);
  }, [productSources]);

  const openShipSources = useCallback((order: OrderTableRecord, product: OrderProductInfo) => {
    setShipSourceOrder(order);
    setShipSourceProduct(product);
    setShipSourceModalOpen(true);
  }, []);

  const handleSaveSources = useCallback(async () => {
    if (!sourceProduct || !sourceAccountId) return;
    const sourcesToSave = sourceRows.filter(source => source.url.trim());
    try {
      await saveProductSourcesMutation.mutateAsync({ accountId: sourceAccountId, productId: sourceProduct.product_id, sources: sourcesToSave });
      setSourceModalOpen(false);
      message.success('货源已保存');
    } catch (err: any) {
      message.error(`保存货源失败: ${err.message}`);
    }
  }, [saveProductSourcesMutation, sourceAccountId, sourceProduct, sourceRows]);

  const openAssociationEditor = useCallback((order: OrderTableRecord) => {
    setAssociationOrder(order);
    setAssociationModalOpen(true);
  }, []);

  const handleSaveAssociation = useCallback(async (input: Pick<OrderAssociation, 'internalRemark' | 'linkedOrders'>) => {
    if (!associationOrder) return;
    try {
      await saveOrderAssociationMutation.mutateAsync({ accountId: associationOrder.accountId, orderId: associationOrder.order_id, input });
      setAssociationModalOpen(false);
      message.success('内部关联已保存');
    } catch (err: any) {
      message.error(`保存内部关联失败: ${err.message}`);
    }
  }, [associationOrder, saveOrderAssociationMutation]);

  const handleLookupTaobaoOrder = useCallback((platformOrderId: string) => {
    if (!associationOrder) return;
    Modal.confirm({
      title: '打开淘宝订单工作页',
      content: '插件将使用一个专用淘宝工作标签页，在后台排队读取采购订单状态、物流公司和快递单号。遇到登录或安全验证时，会自动切到该标签页请你处理。',
      okText: '后台读取',
      cancelText: '取消',
      async onOk() {
        try {
          const session = await extensionApi.purchaseLookup.open({
            accountId: associationOrder.accountId,
            orderId: associationOrder.order_id,
            platformOrderId,
          });
          setAssociationModalOpen(false);
          message.success(session.status === 'queued' ? '已加入淘宝工作页读取队列' : '已提交到淘宝工作标签页后台读取');
        } catch (err: any) {
          message.error(`打开淘宝工作页失败: ${err.message}`);
          throw err;
        }
      },
    });
  }, [associationOrder]);

  const handleCheckPurchaseOrder = useCallback(async (order: OrderTableRecord) => {
    const key = scopedKey(order.accountId, order.order_id);
    const linked = orderAssociations[key]?.linkedOrders[0];
    const platformOrderId = linked?.platform === 'taobao' ? linked.platformOrderId?.trim() : '';
    if (!platformOrderId) {
      message.warning('当前订单还没有关联淘宝订单号');
      return;
    }

    setCheckingPurchaseOrderIds(previous => new Set(previous).add(key));
    try {
      const session = await extensionApi.purchaseLookup.open({
        accountId: order.accountId,
        orderId: order.order_id,
        platformOrderId,
      });
      message.success(session.status === 'queued' ? '已加入淘宝发货状态检查队列' : '已提交淘宝发货状态检查');
    } catch (err: any) {
      setCheckingPurchaseOrderIds(previous => {
        const next = new Set(previous);
        next.delete(key);
        return next;
      });
      message.error(`检查淘宝发货状态失败: ${err.message}`);
    }
  }, [orderAssociations]);

  const submitShipFromPurchase = useCallback(async (
    order: OrderTableRecord,
    logisticsCompany: string,
    trackingNumber: string,
    deliveryId?: string,
  ) => {
    const key = scopedKey(order.accountId, order.order_id);
    setShippingFromPurchaseOrderIds(previous => new Set(previous).add(key));
    try {
      const result = await shipOrderFromPurchaseMutation.mutateAsync({
        accountId: order.accountId,
        orderId: order.order_id,
        logisticsCompany,
        trackingNumber,
        deliveryId,
      });
      message.success(`微信小店发货已提交：${result.deliveryName} ${result.waybillId}`);
      void ordersQuery.refetch();
    } finally {
      setShippingFromPurchaseOrderIds(previous => {
        const next = new Set(previous);
        next.delete(key);
        return next;
      });
    }
  }, [ordersQuery, shipOrderFromPurchaseMutation]);

  const openDeliveryCompanySelector = useCallback(async (
    order: OrderTableRecord,
    logisticsCompany: string,
    trackingNumber: string,
    reason: string,
  ) => {
    let selectedDeliveryId = '';
    let companies: DeliveryCompanyOption[] = [];
    try {
      companies = await extensionApi.orders.listDeliveryCompanies(order.accountId);
    } catch (err: any) {
      message.error(`获取微信小店快递公司列表失败: ${err.message}`);
      return;
    }

    Modal.confirm({
      title: '请选择微信小店快递公司',
      content: (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 13, color: '#595959' }}>{reason}</div>
          <div style={{ fontSize: 13 }}>
            <div>淘宝读取快递公司：{logisticsCompany || '-'}</div>
            <div>淘宝读取快递单号：{trackingNumber || '-'}</div>
          </div>
          <Select
            showSearch={{ optionFilterProp: 'label' }}
            placeholder="选择微信小店快递公司"
            options={companies.map(company => ({
              value: company.deliveryId,
              label: `${company.deliveryName}（${company.deliveryId}）`,
            }))}
            onChange={(value) => {
              selectedDeliveryId = value;
            }}
            style={{ width: '100%' }}
          />
        </div>
      ),
      okText: '使用所选公司回填',
      cancelText: '取消',
      async onOk() {
        if (!selectedDeliveryId) {
          message.warning('请选择微信小店快递公司');
          throw new Error('请选择微信小店快递公司');
        }
        try {
          await submitShipFromPurchase(order, logisticsCompany, trackingNumber, selectedDeliveryId);
        } catch (err: any) {
          message.error(`回填微信小店发货失败: ${err.message}`);
          throw err;
        }
      },
    });
  }, [submitShipFromPurchase]);

  const handleShipFromPurchase = useCallback((order: OrderTableRecord) => {
    const linked = orderAssociations[scopedKey(order.accountId, order.order_id)]?.linkedOrders[0];
    const logisticsCompany = linked?.logisticsCompany?.trim() || '';
    const trackingNumber = linked?.trackingNumber?.trim() || '';
    if (!logisticsCompany || !trackingNumber) {
      message.warning('请先检查发货状态，读取快递公司和快递单号');
      return;
    }
    Modal.confirm({
      title: '回填微信小店发货',
      content: `确认将 ${logisticsCompany} ${trackingNumber} 回填到微信小店订单 ${order.order_id}？`,
      okText: '确认回填',
      cancelText: '取消',
      async onOk() {
        try {
          await submitShipFromPurchase(order, logisticsCompany, trackingNumber);
        } catch (err: any) {
          if (isDeliveryCompanyUnmatchedError(err)) {
            await openDeliveryCompanySelector(
              order,
              logisticsCompany,
              trackingNumber,
              getDeliveryCompanyUnmatchedMessage(err),
            );
            return;
          }
          message.error(`回填微信小店发货失败: ${err.message}`);
          throw err;
        }
      },
    });
  }, [openDeliveryCompanySelector, orderAssociations, submitShipFromPurchase]);

  const handlePrepareTaobaoRefund = useCallback((order: OrderTableRecord) => {
    const linked = orderAssociations[scopedKey(order.accountId, order.order_id)]?.linkedOrders[0];
    const platformOrderId = linked?.platform === 'taobao' ? linked.platformOrderId?.trim() : '';
    if (!platformOrderId) {
      message.warning('当前订单还没有关联淘宝订单号');
      return;
    }
    if (order.status !== OrderStatusEnum.CancelledByAfterSale) {
      message.warning('仅售后取消订单需要申请淘宝退款');
      return;
    }
    if (isLinkedPurchaseRefundFinished(linked)) {
      message.info('淘宝采购单已显示退款结束或交易关闭，无需重复申请退款');
      return;
    }
    const autoSubmit = !hasLinkedPurchaseLogistics(linked);

    Modal.confirm({
      title: autoSubmit ? '自动提交淘宝退款申请' : '打开淘宝退款申请页',
      content: autoSubmit
        ? '当前淘宝采购单未读取到物流公司、物流状态或快递单号。插件将打开退款页，选择“不想要了”，并自动点击淘宝“提交”。'
        : '当前淘宝采购单已有物流信息或发货状态，插件只打开退款页并选择“不想要了”，不会自动提交，请你人工处理退款。',
      okText: autoSubmit ? '自动提交退款' : '打开并选择原因',
      cancelText: '取消',
      async onOk() {
        const key = scopedKey(order.accountId, order.order_id);
        setPreparingTaobaoRefundOrderIds(previous => new Set(previous).add(key));
        try {
          const session = await extensionApi.taobaoRefund.open({
            accountId: order.accountId,
            orderId: order.order_id,
            platformOrderId,
            reason: '不想要了',
            autoSubmit,
          });
          message.success(session.status === 'opened'
            ? (autoSubmit ? '已打开淘宝退款页，准备自动提交' : '已打开淘宝退款页，正在选择退款原因')
            : '淘宝退款申请已创建');
        } catch (err: any) {
          setPreparingTaobaoRefundOrderIds(previous => {
            const next = new Set(previous);
            next.delete(key);
            return next;
          });
          message.error(`打开淘宝退款页失败: ${err.message}`);
          throw err;
        }
      },
    });
  }, [orderAssociations]);

  const handleOpenShippingSession = useCallback(async (source: ProductSourceItem) => {
    if (!shipSourceOrder || !shipSourceProduct) return;
    const address = realAddressCaches[scopedKey(shipSourceOrder.accountId, shipSourceOrder.order_id)]?.address;

    /**
     * 发货会话是 dashboard 到淘宝 content script 的唯一桥梁。
     * 真实地址接口有每日额度限制，因此这里只复用用户已经手动解密过的地址；
     * 未解密订单会在淘宝浮窗里提供显式按钮，由用户确认后再消耗额度。
     */
    await extensionApi.shipping.open({
      accountId: shipSourceOrder.accountId,
      orderId: shipSourceOrder.order_id,
      productId: shipSourceProduct.product_id,
      source: {
        id: source.id,
        url: normalizeUrl(source.url),
        quantity: source.quantity,
        remark: source.remark,
      },
      order: {
        orderId: shipSourceOrder.order_id,
        productId: shipSourceProduct.product_id,
        title: shipSourceProduct.title,
        skuCode: shipSourceProduct.sku_code,
        skuAttrs: shipSourceProduct.sku_attrs || [],
        quantity: shipSourceProduct.sku_cnt,
        thumbImg: shipSourceProduct.thumb_img,
        address,
        merchantNotes: shipSourceOrder.order_detail?.ext_info?.merchant_notes,
        customerNotes: shipSourceOrder.order_detail?.ext_info?.customer_notes,
        createTime: shipSourceOrder.create_time,
        payTime: shipSourceOrder.order_detail?.pay_info?.pay_time,
        orderPrice: shipSourceOrder.order_detail?.price_info?.order_price,
        estimatedCommissionFee: getEstimatedCommissionFee(shipSourceOrder),
      },
    });
    setShipSourceModalOpen(false);
    message.success(address ? '已打开淘宝发货页' : '已打开淘宝发货页，真实地址需手动获取');
  }, [realAddressCaches, shipSourceOrder, shipSourceProduct]);

  const columns = useMemo(() => createOrderColumns({
    showAccountInfo: scope.type === 'all',
    realAddressCaches,
    decodingOrderIds,
    productSources,
    orderAssociations,
    checkingPurchaseOrderIds,
    shippingFromPurchaseOrderIds,
    preparingTaobaoRefundOrderIds,
    onCopyText: handleCopyText,
    onCopyImage: handleCopyImage,
    onCopyAddress: handleCopyAddress,
    onDecodeAddress: handleDecodeAddress,
    onRefreshAddress: handleRefreshAddress,
    onViewDetail: handleViewDetail,
    onOpenSourceManager: openSourceManager,
    onOpenShipSources: openShipSources,
    onEditAssociation: openAssociationEditor,
    onCheckPurchaseOrder: handleCheckPurchaseOrder,
    onShipFromPurchase: handleShipFromPurchase,
    onPrepareTaobaoRefund: handlePrepareTaobaoRefund,
  }), [
    realAddressCaches,
    scope.type,
    decodingOrderIds,
    productSources,
    orderAssociations,
    checkingPurchaseOrderIds,
    shippingFromPurchaseOrderIds,
    preparingTaobaoRefundOrderIds,
    handleCopyText,
    handleCopyImage,
    handleCopyAddress,
    handleDecodeAddress,
    handleRefreshAddress,
    handleViewDetail,
    openSourceManager,
    openShipSources,
    openAssociationEditor,
    handleCheckPurchaseOrder,
    handleShipFromPurchase,
    handlePrepareTaobaoRefund,
  ]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <OrderToolbar
        activeStatus={activeStatus}
        timeScope={timeScope}
        searchActive={!!activeSearch?.keyword.trim()}
        searchType={searchType}
        searchSource={searchSource}
        searchKeyword={searchKeyword}
        loading={loading}
        refreshing={refreshOrdersMutation.isPending}
        error={error}
        syncState={syncStateQuery.data}
        onStatusChange={handleStatusChange}
        onTimeScopeChange={handleTimeScopeChange}
        onSearchTypeChange={setSearchType}
        onSearchSourceChange={setSearchSource}
        onSearchKeywordChange={setSearchKeyword}
        onSearch={handleSearch}
        onRefresh={() => {
          console.info('[wishop][orders:ui] manual refresh start', {
            scope,
            accountIds,
            activeStatus: activeStatus ?? 'all',
            searchSource,
          });
          refreshOrdersMutation.mutate(undefined, {
            onSuccess: (result) => {
              console.info('[wishop][orders:ui] manual refresh success', result);
              if (result.failedAccounts.length > 0 && result.refreshedAccountIds.length === 0) {
                setRefreshError(`订单刷新失败：${result.failedAccounts.map(item => `${item.accountName || item.accountId}: ${item.error}`).join('; ')}`);
                message.error(`订单刷新失败：${result.failedAccounts.map(item => item.error).join('; ')}`);
              } else if (result.failedAccounts.length > 0) {
                setRefreshError(`部分账号刷新失败：${result.failedAccounts.map(item => `${item.accountName || item.accountId}: ${item.error}`).join('; ')}`);
                message.warning(`部分账号刷新失败，已同步 ${result.updatedOrderCount} 条订单`);
              } else if (result.updatedOrderCount === 0) {
                setRefreshError('');
                message.warning('本次未同步到订单，已扫描近约 180 天订单窗口');
              } else {
                setRefreshError('');
                message.success(`订单刷新完成，同步 ${result.updatedOrderCount} 条订单`);
              }
              void ordersQuery.refetch();
            },
            onError: (err: any) => {
              const messageText = err?.message || String(err);
              setRefreshError(messageText);
              console.error('[wishop][orders:ui] manual refresh failed', {
                scope,
                accountIds,
                error: messageText,
              });
              message.error(`订单刷新失败: ${messageText}`);
            },
          });
        }}
        onClearError={() => setHiddenError(visibleError)}
      />

      <div ref={tableAreaRef} style={{ flex: 1, minHeight: 0 }}>
        <Table
          dataSource={orders}
          columns={columns}
          rowKey={(record) => scopedKey(record.accountId, record.order_id)}
          size="small"
          loading={loading}
          pagination={false}
          scroll={{ x: 1146, y: scrollY }}
          styles={{
            content: { height: '100%', display: 'flex', flexDirection: 'column' },
            section: { flex: 1 },
          }}
          locale={{ emptyText: <Empty description="暂无订单" /> }}
          footer={() => {
            if (loading) return null;
            if (hasMore) {
              return (
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <Button size="small" loading={loading} onClick={handleLoadMore}>加载更多</Button>
                </div>
              );
            }
            if (orders.length === 0) return null;
            return <div style={{ textAlign: 'center', color: '#bbb', fontSize: 12, padding: '8px 0' }}>— 没有更多订单 —</div>;
          }}
        />
      </div>

      <OrderDetailModal
        open={detailModalOpen}
        loading={detailQuery.isLoading || detailQuery.isFetching}
        order={detailQuery.data || null}
        realAddressCache={detailQuery.data ? realAddressCaches[scopedKey(detailAccountId, detailQuery.data.order_id)] : undefined}
        onCancel={() => setDetailModalOpen(false)}
      />

      <SourceManagementModal
        open={sourceModalOpen}
        product={sourceProduct}
        rows={sourceRows}
        saving={saveProductSourcesMutation.isPending}
        onRowsChange={setSourceRows}
        onCancel={() => setSourceModalOpen(false)}
        onSave={handleSaveSources}
      />

      <ShippingSourceModal
        open={shipSourceModalOpen}
        product={shipSourceProduct}
        sources={shipSourceOrder && shipSourceProduct ? productSources[scopedKey(shipSourceOrder.accountId, shipSourceProduct.product_id)] || [] : []}
        onCancel={() => setShipSourceModalOpen(false)}
        onOpenShipping={handleOpenShippingSession}
      />
      <OrderAssociationModal
        open={associationModalOpen}
        association={associationOrder ? orderAssociations[scopedKey(associationOrder.accountId, associationOrder.order_id)] : undefined}
        saving={saveOrderAssociationMutation.isPending}
        onCancel={() => setAssociationModalOpen(false)}
        onSave={handleSaveAssociation}
        onLookupTaobaoOrder={handleLookupTaobaoOrder}
      />
    </div>
  );
};

export default React.memo(Orders);
