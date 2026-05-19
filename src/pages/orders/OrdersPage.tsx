import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Table, Button, Empty, message } from 'antd';
import { useOrders } from '../../hooks/useIpc';
import { extensionApi } from '../../shared/extension-api';
import type { Order, OrderStatus, OrderProductInfo, OrderSearchParams, OrderAddressInfo, ProductSourceItem } from '../../shared/types';
import { formatOrderAddressForCopy } from '../../shared/address-format';
import { newProductSourceRow, ShippingSourceModal, SourceManagementModal } from './components/ProductSourceModals';
import { OrderDetailModal } from './components/OrderDetailModal';
import { createOrderColumns } from './components/OrderTableColumns';
import { OrderToolbar } from './components/OrderToolbar';

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
  const { orders, hasMore, loading, error, clearError, fetchOrders, fetchOrderDetail, searchOrders, decodeAddress } = useOrders(accountId);
  const [activeStatus, setActiveStatus] = useState<OrderStatus | undefined>(undefined);
  const [searchType, setSearchType] = useState<OrderSearchParams['search_type']>('order_id');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [decodedAddresses, setDecodedAddresses] = useState<Record<string, OrderAddressInfo>>({});
  const [decodingOrderIds, setDecodingOrderIds] = useState<Set<string>>(new Set());
  const [productSources, setProductSourcesState] = useState<Record<string, ProductSourceItem[]>>({});
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
      fetchOrders();
      extensionApi.productSources.list(accountId)
        .then(bindings => {
          setProductSourcesState(Object.fromEntries(bindings.map(binding => [binding.productId, binding.sources])));
        })
        .catch((err: Error) => message.error(`加载货源失败: ${err.message}`));
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
      const addr = await decodeAddress(orderId);
      if (addr) {
        setDecodedAddresses(prev => ({ ...prev, [orderId]: addr }));
        const text = formatOrderAddressForCopy(addr);
        navigator.clipboard.writeText(text).then(() => message.success('真实地址已显示并复制')).catch(() => message.success('真实地址已显示'));
      }
    } finally {
      setDecodingOrderIds(prev => { const s = new Set(prev); s.delete(orderId); return s; });
    }
  }, [decodeAddress]);

  const handleCopyAddress = useCallback((addr: OrderAddressInfo) => {
    const text = formatOrderAddressForCopy(addr);
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

  const handleOpenShippingSession = useCallback(async (source: ProductSourceItem) => {
    if (!shipSourceOrder || !shipSourceProduct) return;
    const address = decodedAddresses[shipSourceOrder.order_id];

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
  }, [accountId, decodedAddresses, shipSourceOrder, shipSourceProduct]);

  const columns = useMemo(() => createOrderColumns({
    decodedAddresses,
    decodingOrderIds,
    productSources,
    onCopyText: handleCopyText,
    onCopyImage: handleCopyImage,
    onCopyAddress: handleCopyAddress,
    onDecodeAddress: handleDecodeAddress,
    onViewDetail: handleViewDetail,
    onOpenSourceManager: openSourceManager,
    onOpenShipSources: openShipSources,
  }), [
    decodedAddresses,
    decodingOrderIds,
    productSources,
    handleCopyText,
    handleCopyImage,
    handleCopyAddress,
    handleDecodeAddress,
    handleViewDetail,
    openSourceManager,
    openShipSources,
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
          scroll={{ x: 1100, y: scrollY }}
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
    </div>
  );
};

export default React.memo(Orders);
