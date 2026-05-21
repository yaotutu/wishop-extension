import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Table, Button, Empty, Modal, message } from 'antd';
import {
  useFetchRealAddressMutation,
  useOrderAssociationsQuery,
  useOrderDetailQuery,
  useOrdersQuery,
  useProductSourcesQuery,
  useRealAddressCachesQuery,
  useSaveOrderAssociationMutation,
  useSaveProductSourcesMutation,
} from '../../hooks/useIpc';
import { extensionApi } from '../../shared/extension-api';
import type { Order, OrderStatus, OrderProductInfo, OrderSearchParams, OrderRealAddressCache, OrderAssociation, ProductSourceItem } from '../../shared/types';
import { formatOrderAddressForCopy } from '../../shared/address-format';
import { newProductSourceRow, ShippingSourceModal, SourceManagementModal } from './components/ProductSourceModals';
import { OrderDetailModal } from './components/OrderDetailModal';
import { createOrderColumns } from './components/OrderTableColumns';
import { OrderToolbar } from './components/OrderToolbar';
import { OrderAssociationModal } from './components/OrderAssociationModal';

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

const Orders: React.FC<{ accountId: string }> = ({ accountId }) => {
  const [activeStatus, setActiveStatus] = useState<OrderStatus | undefined>(undefined);
  const [searchType, setSearchType] = useState<OrderSearchParams['search_type']>('order_id');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [activeSearch, setActiveSearch] = useState<OrderSearchParams | null>(null);
  const [hiddenError, setHiddenError] = useState('');
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailOrderId, setDetailOrderId] = useState('');
  const [decodingOrderIds, setDecodingOrderIds] = useState<Set<string>>(new Set());
  const [associationModalOpen, setAssociationModalOpen] = useState(false);
  const [associationOrder, setAssociationOrder] = useState<Order | null>(null);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [sourceProduct, setSourceProduct] = useState<OrderProductInfo | null>(null);
  const [sourceRows, setSourceRows] = useState<ProductSourceItem[]>([]);
  const [shipSourceModalOpen, setShipSourceModalOpen] = useState(false);
  const [shipSourceOrder, setShipSourceOrder] = useState<Order | null>(null);
  const [shipSourceProduct, setShipSourceProduct] = useState<OrderProductInfo | null>(null);
  const tableAreaRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(400);
  const ordersQuery = useOrdersQuery(accountId, activeStatus, activeSearch);
  const detailQuery = useOrderDetailQuery(accountId, detailOrderId);
  const productSourcesQuery = useProductSourcesQuery(accountId);
  const orderAssociationsQuery = useOrderAssociationsQuery(accountId);
  const refetchOrderAssociations = orderAssociationsQuery.refetch;
  const realAddressCachesQuery = useRealAddressCachesQuery(accountId);
  const saveProductSourcesMutation = useSaveProductSourcesMutation(accountId);
  const saveOrderAssociationMutation = useSaveOrderAssociationMutation(accountId);
  const fetchRealAddressMutation = useFetchRealAddressMutation(accountId);
  const orders = ordersQuery.orders;
  const hasMore = ordersQuery.hasMore;
  const loading = ordersQuery.loading;
  const productSources = productSourcesQuery.data || {};
  const orderAssociations = orderAssociationsQuery.data || {};
  const realAddressCaches = realAddressCachesQuery.data || {};
  const orderError = ordersQuery.error instanceof Error ? ordersQuery.error.message : '';
  const error = orderError && orderError !== hiddenError ? orderError : null;

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
    setActiveSearch(null);
    setSearchKeyword('');
    setDetailOrderId('');
  }, [accountId]);

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
    const offCompleted = extensionApi.purchaseLookup.onCompleted(() => {
      void refetchOrderAssociations();
      message.success('淘宝订单信息已回填到采购单详情');
    });
    const offFailed = extensionApi.purchaseLookup.onFailed((payload) => {
      if (payload.accountId !== accountId) return;
      message.error(`淘宝订单读取失败: ${payload.error}`);
    });
    const offChallenge = extensionApi.purchaseLookup.onChallenge((payload) => {
      if (payload.accountId !== accountId) return;
      message.warning(`淘宝工作页需要处理验证: ${payload.reason}`);
    });
    return () => {
      offCompleted();
      offFailed();
      offChallenge();
    };
  }, [accountId, refetchOrderAssociations]);

  const handleStatusChange = useCallback((val: string | number | null) => {
    if (val === null) return;
    const status = val === 'all' ? undefined : val as OrderStatus;
    setActiveStatus(status);
    setSearchKeyword('');
    setActiveSearch(null);
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

  const handleViewDetail = useCallback((orderId: string) => {
    setDetailModalOpen(true);
    setDetailOrderId(orderId);
  }, []);

  const handleDecodeAddress = useCallback(async (orderId: string) => {
    setDecodingOrderIds(prev => new Set(prev).add(orderId));
    try {
      const cache = await fetchRealAddressMutation.mutateAsync({ orderId, refresh: false });
      if (cache) {
        const text = formatOrderAddressForCopy(cache.address);
        navigator.clipboard.writeText(text).then(() => message.success('真实地址已显示并复制')).catch(() => message.success('真实地址已显示'));
      }
    } catch (err: any) {
      message.error(`获取真实地址失败: ${err.message}`);
    } finally {
      setDecodingOrderIds(prev => { const s = new Set(prev); s.delete(orderId); return s; });
    }
  }, [fetchRealAddressMutation]);

  const handleRefreshAddress = useCallback(async (orderId: string) => {
    setDecodingOrderIds(prev => new Set(prev).add(orderId));
    try {
      await fetchRealAddressMutation.mutateAsync({ orderId, refresh: true });
      message.success('真实地址已刷新');
    } catch (err: any) {
      message.error(`刷新真实地址失败: ${err.message}`);
    } finally {
      setDecodingOrderIds(prev => { const s = new Set(prev); s.delete(orderId); return s; });
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

  const openSourceManager = useCallback((product: OrderProductInfo) => {
    setSourceProduct(product);
    const sources = (productSources[product.product_id] || []).map(source => ({ ...source }));
    setSourceRows(sources.length > 0 ? sources : [newProductSourceRow()]);
    setSourceModalOpen(true);
  }, [productSources]);

  const openShipSources = useCallback((order: Order, product: OrderProductInfo) => {
    setShipSourceOrder(order);
    setShipSourceProduct(product);
    setShipSourceModalOpen(true);
  }, []);

  const handleSaveSources = useCallback(async () => {
    if (!sourceProduct) return;
    const sourcesToSave = sourceRows.filter(source => source.url.trim());
    try {
      await saveProductSourcesMutation.mutateAsync({ productId: sourceProduct.product_id, sources: sourcesToSave });
      setSourceModalOpen(false);
      message.success('货源已保存');
    } catch (err: any) {
      message.error(`保存货源失败: ${err.message}`);
    }
  }, [saveProductSourcesMutation, sourceProduct, sourceRows]);

  const openAssociationEditor = useCallback((order: Order) => {
    setAssociationOrder(order);
    setAssociationModalOpen(true);
  }, []);

  const handleSaveAssociation = useCallback(async (input: Pick<OrderAssociation, 'internalRemark' | 'linkedOrders'>) => {
    if (!associationOrder) return;
    try {
      await saveOrderAssociationMutation.mutateAsync({ orderId: associationOrder.order_id, input });
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
            accountId,
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
  }, [accountId, associationOrder]);

  const handleOpenShippingSession = useCallback(async (source: ProductSourceItem) => {
    if (!shipSourceOrder || !shipSourceProduct) return;
    const address = realAddressCaches[shipSourceOrder.order_id]?.address;

    /**
     * 发货会话是 dashboard 到淘宝 content script 的唯一桥梁。
     * 真实地址接口有每日额度限制，因此这里只复用用户已经手动解密过的地址；
     * 未解密订单会在淘宝浮窗里提供显式按钮，由用户确认后再消耗额度。
     */
    await extensionApi.shipping.open({
      accountId,
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
      },
    });
    setShipSourceModalOpen(false);
    message.success(address ? '已打开淘宝发货页' : '已打开淘宝发货页，真实地址需手动获取');
  }, [accountId, realAddressCaches, shipSourceOrder, shipSourceProduct]);

  const columns = useMemo(() => createOrderColumns({
    realAddressCaches,
    decodingOrderIds,
    productSources,
    orderAssociations,
    onCopyText: handleCopyText,
    onCopyImage: handleCopyImage,
    onCopyAddress: handleCopyAddress,
    onDecodeAddress: handleDecodeAddress,
    onRefreshAddress: handleRefreshAddress,
    onViewDetail: handleViewDetail,
    onOpenSourceManager: openSourceManager,
    onOpenShipSources: openShipSources,
    onEditAssociation: openAssociationEditor,
  }), [
    realAddressCaches,
    decodingOrderIds,
    productSources,
    orderAssociations,
    handleCopyText,
    handleCopyImage,
    handleCopyAddress,
    handleDecodeAddress,
    handleRefreshAddress,
    handleViewDetail,
    openSourceManager,
    openShipSources,
    openAssociationEditor,
  ]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <OrderToolbar
        activeStatus={activeStatus}
        searchType={searchType}
        searchKeyword={searchKeyword}
        loading={loading}
        error={error}
        onStatusChange={handleStatusChange}
        onSearchTypeChange={setSearchType}
        onSearchKeywordChange={setSearchKeyword}
        onSearch={handleSearch}
        onRefresh={() => ordersQuery.refetch()}
        onClearError={() => setHiddenError(orderError)}
      />

      <div ref={tableAreaRef} style={{ flex: 1, minHeight: 0 }}>
        <Table
          dataSource={orders}
          columns={columns}
          rowKey="order_id"
          size="small"
          loading={loading}
          pagination={false}
          scroll={{ x: 1050, y: scrollY }}
          styles={{
            content: { height: '100%', display: 'flex', flexDirection: 'column' },
            section: { flex: 1 },
          }}
          locale={{ emptyText: <Empty description="暂无订单" /> }}
          footer={() => {
            if (loading || orders.length === 0) return null;
            if (hasMore) {
              return (
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <Button size="small" loading={loading} onClick={handleLoadMore}>加载更多</Button>
                </div>
              );
            }
            return <div style={{ textAlign: 'center', color: '#bbb', fontSize: 12, padding: '8px 0' }}>— 没有更多订单 —</div>;
          }}
        />
      </div>

      <OrderDetailModal
        open={detailModalOpen}
        loading={detailQuery.isLoading || detailQuery.isFetching}
        order={detailQuery.data || null}
        realAddressCache={detailQuery.data ? realAddressCaches[detailQuery.data.order_id] : undefined}
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
        sources={shipSourceProduct ? productSources[shipSourceProduct.product_id] || [] : []}
        onCancel={() => setShipSourceModalOpen(false)}
        onOpenShipping={handleOpenShippingSession}
      />
      <OrderAssociationModal
        open={associationModalOpen}
        association={associationOrder ? orderAssociations[associationOrder.order_id] : undefined}
        saving={saveOrderAssociationMutation.isPending}
        onCancel={() => setAssociationModalOpen(false)}
        onSave={handleSaveAssociation}
        onLookupTaobaoOrder={handleLookupTaobaoOrder}
      />
    </div>
  );
};

export default React.memo(Orders);
