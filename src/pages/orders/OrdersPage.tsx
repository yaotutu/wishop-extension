import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Table, Button, Empty, message } from 'antd';
import { useOrders } from '../../hooks/useIpc';
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

function isUnknownRuntimeChannelError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('Unknown runtime channel');
}

async function fetchRealAddressWithFallback(accountId: string, orderId: string, refresh: boolean): Promise<OrderRealAddressCache> {
  try {
    return refresh
      ? await extensionApi.orderRealAddresses.refresh(accountId, orderId)
      : await extensionApi.orderRealAddresses.fetch(accountId, orderId);
  } catch (err) {
    if (!isUnknownRuntimeChannelError(err)) throw err;
    const address = await extensionApi.orders.decodeAddress(accountId, orderId);
    const now = Date.now();
    return {
      orderId,
      address,
      fetchedAt: now,
      updatedAt: now,
    };
  }
}

async function readLocalRealAddressCaches(accountId: string): Promise<OrderRealAddressCache[]> {
  const data = await chrome.storage.local.get('accounts');
  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  const account = accounts.find((item: { id?: string }) => item.id === accountId);
  return Array.isArray(account?.realAddressCaches) ? account.realAddressCaches : [];
}

async function persistLocalRealAddressCache(accountId: string, cache: OrderRealAddressCache): Promise<void> {
  const data = await chrome.storage.local.get('accounts');
  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  const nextAccounts = accounts.map((account: { id?: string; realAddressCaches?: OrderRealAddressCache[] }) => {
    if (account.id !== accountId) return account;
    const caches = Array.isArray(account.realAddressCaches) ? account.realAddressCaches : [];
    return {
      ...account,
      realAddressCaches: [...caches.filter(item => item.orderId !== cache.orderId), cache],
    };
  });
  await chrome.storage.local.set({ accounts: nextAccounts });
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
  const { orders, hasMore, loading, error, clearError, fetchOrders, fetchOrderDetail, searchOrders } = useOrders(accountId);
  const [activeStatus, setActiveStatus] = useState<OrderStatus | undefined>(undefined);
  const [searchType, setSearchType] = useState<OrderSearchParams['search_type']>('order_id');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [realAddressCaches, setRealAddressCaches] = useState<Record<string, OrderRealAddressCache>>({});
  const [decodingOrderIds, setDecodingOrderIds] = useState<Set<string>>(new Set());
  const [productSources, setProductSourcesState] = useState<Record<string, ProductSourceItem[]>>({});
  const [orderAssociations, setOrderAssociations] = useState<Record<string, OrderAssociation>>({});
  const [associationModalOpen, setAssociationModalOpen] = useState(false);
  const [associationOrder, setAssociationOrder] = useState<Order | null>(null);
  const [associationSaving, setAssociationSaving] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [sourceProduct, setSourceProduct] = useState<OrderProductInfo | null>(null);
  const [sourceRows, setSourceRows] = useState<ProductSourceItem[]>([]);
  const [sourceSaving, setSourceSaving] = useState(false);
  const [shipSourceModalOpen, setShipSourceModalOpen] = useState(false);
  const [shipSourceOrder, setShipSourceOrder] = useState<Order | null>(null);
  const [shipSourceProduct, setShipSourceProduct] = useState<OrderProductInfo | null>(null);
  const tableAreaRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(400);

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
    if (accountId) {
      setActiveStatus(undefined);
      setProductSourcesState({});
      setOrderAssociations({});
      setRealAddressCaches({});
      fetchOrders();
      extensionApi.productSources.list(accountId)
        .then(bindings => {
          setProductSourcesState(Object.fromEntries(bindings.map(binding => [binding.productId, binding.sources])));
        })
        .catch((err: Error) => message.error(`加载货源失败: ${err.message}`));
      extensionApi.orderAssociations.list(accountId)
        .then(associations => {
          setOrderAssociations(Object.fromEntries(associations.map(item => [item.orderId, item])));
        })
        .catch((err: Error) => message.error(`加载订单关联失败: ${err.message}`));
      extensionApi.orderRealAddresses.list(accountId)
        .then(caches => {
          setRealAddressCaches(Object.fromEntries(caches.map(item => [item.orderId, item])));
        })
        .catch(async (err: Error) => {
          // 开发热更新时可能出现 dashboard 已更新、background service worker 仍是旧版本。
          // 这种情况下先不打扰用户；重新加载插件后新 channel 会正常可用。
          if (isUnknownRuntimeChannelError(err)) {
            const caches = await readLocalRealAddressCaches(accountId);
            setRealAddressCaches(Object.fromEntries(caches.map(item => [item.orderId, item])));
            return;
          }
          message.error(`加载真实地址缓存失败: ${err.message}`);
        });
    }
  }, [accountId, fetchOrders]);

  const handleStatusChange = useCallback((val: string | number | null) => {
    if (val === null) return;
    const status = val === 'all' ? undefined : val as OrderStatus;
    setActiveStatus(status);
    setSearchKeyword('');
    fetchOrders(status);
  }, [fetchOrders]);

  const handleSearch = useCallback((value: string) => {
    if (!value?.trim()) {
      fetchOrders(activeStatus);
      return;
    }
    searchOrders({ search_type: searchType, keyword: value.trim() });
  }, [activeStatus, searchType, fetchOrders, searchOrders]);

  const handleLoadMore = useCallback(() => {
    fetchOrders(activeStatus, true);
  }, [activeStatus, fetchOrders]);

  const handleViewDetail = useCallback(async (orderId: string) => {
    setDetailModalOpen(true);
    setDetailLoading(true);
    setDetailOrder(null);
    const order = await fetchOrderDetail(orderId);
    setDetailOrder(order);
    setDetailLoading(false);
  }, [fetchOrderDetail]);

  const handleDecodeAddress = useCallback(async (orderId: string) => {
    setDecodingOrderIds(prev => new Set(prev).add(orderId));
    try {
      const cache = await fetchRealAddressWithFallback(accountId, orderId, false);
      if (cache) {
        await persistLocalRealAddressCache(accountId, cache);
        setRealAddressCaches(prev => ({ ...prev, [orderId]: cache }));
        const text = formatOrderAddressForCopy(cache.address);
        navigator.clipboard.writeText(text).then(() => message.success('真实地址已显示并复制')).catch(() => message.success('真实地址已显示'));
      }
    } catch (err: any) {
      message.error(`获取真实地址失败: ${err.message}`);
    } finally {
      setDecodingOrderIds(prev => { const s = new Set(prev); s.delete(orderId); return s; });
    }
  }, [accountId]);

  const handleRefreshAddress = useCallback(async (orderId: string) => {
    setDecodingOrderIds(prev => new Set(prev).add(orderId));
    try {
      const cache = await fetchRealAddressWithFallback(accountId, orderId, true);
      await persistLocalRealAddressCache(accountId, cache);
      setRealAddressCaches(prev => ({ ...prev, [orderId]: cache }));
      message.success('真实地址已刷新');
    } catch (err: any) {
      message.error(`刷新真实地址失败: ${err.message}`);
    } finally {
      setDecodingOrderIds(prev => { const s = new Set(prev); s.delete(orderId); return s; });
    }
  }, [accountId]);

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

  const syncProductSources = useCallback((productId: string, sources: ProductSourceItem[]) => {
    setProductSourcesState(prev => {
      const next = { ...prev };
      if (sources.length > 0) next[productId] = sources;
      else delete next[productId];
      return next;
    });
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
    setSourceSaving(true);
    try {
      const binding = await extensionApi.productSources.set(accountId, sourceProduct.product_id, sourcesToSave);
      syncProductSources(sourceProduct.product_id, binding.sources);
      setSourceModalOpen(false);
      message.success('货源已保存');
    } catch (err: any) {
      message.error(`保存货源失败: ${err.message}`);
    } finally {
      setSourceSaving(false);
    }
  }, [accountId, sourceProduct, sourceRows, syncProductSources]);

  const openAssociationEditor = useCallback((order: Order) => {
    setAssociationOrder(order);
    setAssociationModalOpen(true);
  }, []);

  const handleSaveAssociation = useCallback(async (input: Pick<OrderAssociation, 'internalRemark' | 'linkedOrders'>) => {
    if (!associationOrder) return;
    setAssociationSaving(true);
    try {
      const saved = await extensionApi.orderAssociations.set(accountId, associationOrder.order_id, input);
      setOrderAssociations(prev => {
        const next = { ...prev };
        if (saved.internalRemark || saved.linkedOrders.length > 0) next[saved.orderId] = saved;
        else delete next[saved.orderId];
        return next;
      });
      setAssociationModalOpen(false);
      message.success('内部关联已保存');
    } catch (err: any) {
      message.error(`保存内部关联失败: ${err.message}`);
    } finally {
      setAssociationSaving(false);
    }
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
        onRefresh={() => fetchOrders(activeStatus)}
        onClearError={clearError}
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
        loading={detailLoading}
        order={detailOrder}
        realAddressCache={detailOrder ? realAddressCaches[detailOrder.order_id] : undefined}
        onCancel={() => setDetailModalOpen(false)}
      />

      <SourceManagementModal
        open={sourceModalOpen}
        product={sourceProduct}
        rows={sourceRows}
        saving={sourceSaving}
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
        saving={associationSaving}
        onCancel={() => setAssociationModalOpen(false)}
        onSave={handleSaveAssociation}
      />
    </div>
  );
};

export default React.memo(Orders);
