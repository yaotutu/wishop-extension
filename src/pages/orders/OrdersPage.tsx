import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Table, Tag, Button, Input, Select, Modal, Descriptions, Image, Spin, Empty, Alert, Flex, Typography, Space, message } from 'antd';
import { ReloadOutlined, EyeOutlined, SendOutlined, LoginOutlined } from '@ant-design/icons';
import { useOrders } from '../../hooks/useIpc';
import type { Order, OrderStatus, OrderProductInfo, OrderSearchParams, OrderAddressInfo } from '../../shared/types';
import { OrderStatus as OrderStatusEnum } from '../../shared/types';

const { Text } = Typography;

const STATUS_CONFIG: Record<number, { color: string; text: string }> = {
  [OrderStatusEnum.PendingPayment]: { color: 'orange', text: '待付款' },
  [OrderStatusEnum.GiftPendingAccept]: { color: 'purple', text: '礼物待收下' },
  [OrderStatusEnum.GroupBuying]: { color: 'cyan', text: '凑单中' },
  [OrderStatusEnum.PendingShipment]: { color: 'blue', text: '待发货' },
  [OrderStatusEnum.PartialShipment]: { color: 'geekblue', text: '部分发货' },
  [OrderStatusEnum.PendingReceipt]: { color: 'cyan', text: '待收货' },
  [OrderStatusEnum.Completed]: { color: 'green', text: '已完成' },
  [OrderStatusEnum.CancelledByAfterSale]: { color: 'red', text: '售后取消' },
  [OrderStatusEnum.CancelledByUser]: { color: 'default', text: '已取消' },
};

const PAYMENT_METHOD: Record<number, string> = {
  1: '微信支付',
  2: '先用后付',
  3: '0元抽奖',
  4: '积分兑换',
};

const STATUS_FILTER_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '待付款', value: OrderStatusEnum.PendingPayment },
  { label: '待发货', value: OrderStatusEnum.PendingShipment },
  { label: '已发货', value: OrderStatusEnum.PendingReceipt },
  { label: '已完成', value: OrderStatusEnum.Completed },
];

const SEARCH_TYPE_OPTIONS = [
  { value: 'order_id', label: '订单号' },
  { value: 'title', label: '商品标题' },
  { value: 'user_name', label: '收件人' },
  { value: 'merchant_notes', label: '商家备注' },
  { value: 'customer_notes', label: '买家备注' },
];

function formatTime(timestamp: number): string {
  if (!timestamp) return '-';
  const d = new Date(timestamp * 1000);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatPrice(cents: number): string {
  if (cents === undefined || cents === null) return '-';
  return `¥${(cents / 100).toFixed(2)}`;
}

const firstProduct = (order: Order): OrderProductInfo | undefined =>
  order.order_detail?.product_infos?.[0];

const canDecodeAddress = (status: OrderStatus): boolean =>
  [OrderStatusEnum.PendingShipment, OrderStatusEnum.PartialShipment, OrderStatusEnum.PendingReceipt].includes(status);

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
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [shipUrl, setShipUrl] = useState('');
  const tableAreaRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(400);

  const openExternal = useCallback(async (url: string) => {
    await chrome.tabs.create({ url });
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
    if (accountId) {
      setActiveStatus(undefined);
      fetchOrders();
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
    const addr = await decodeAddress(orderId);
    if (addr) {
      setDecodedAddresses(prev => ({ ...prev, [orderId]: addr }));
      const text = `${addr.user_name} ${addr.tel_number}\n${addr.province_name || ''}${addr.city_name || ''}${addr.county_name || ''}${addr.detail_info || ''}`;
      navigator.clipboard.writeText(text).then(() => message.success('地址已复制')).catch(() => {});
    }
    setDecodingOrderIds(prev => { const s = new Set(prev); s.delete(orderId); return s; });
  }, [decodeAddress]);

  const handleCopyAddress = useCallback((addr: OrderAddressInfo) => {
    const text = `${addr.user_name} ${addr.tel_number}\n${addr.province_name || ''}${addr.city_name || ''}${addr.county_name || ''}${addr.detail_info || ''}`;
    navigator.clipboard.writeText(text).then(() => message.success('地址已复制')).catch(() => {});
  }, []);

  const columns = [
    {
      title: '订单信息',
      key: 'order_info',
      width: 280,
      render: (_: unknown, record: Order) => {
        const product = firstProduct(record);
        return (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            {product?.thumb_img && (
              <Image src={product.thumb_img} width={50} height={50} alt={product.title || '商品图片'} style={{ borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} preview={false} />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{record.order_id}</Text>
              <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product?.title || '-'}</div>
              {product?.sku_code && <Text type="secondary" style={{ fontSize: 12 }}>编码: {product.sku_code}</Text>}
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>下单: {formatTime(record.create_time)}</Text>
            </div>
          </div>
        );
      },
    },
    {
      title: '规格/数量',
      key: 'sku',
      width: 140,
      render: (_: unknown, record: Order) => {
        const product = firstProduct(record);
        if (!product) return '-';
        const specs = product.sku_attrs?.map(a => a.attr_value).join(', ') || '-';
        return (
          <div>
            <div style={{ fontSize: 12, color: '#333' }}>{specs}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>x{product.sku_cnt}</Text>
          </div>
        );
      },
    },
    {
      title: '实付款',
      key: 'price',
      width: 130,
      render: (_: unknown, record: Order) => {
        const pi = record.order_detail?.price_info;
        if (!pi) return '-';
        return (
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{formatPrice(pi.order_price)}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>商品 {formatPrice(pi.product_price)}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>运费 {formatPrice(pi.freight)}</Text>
            {pi.discounted_price > 0 && (
              <>
                <br />
                <Text type="danger" style={{ fontSize: 12 }}>优惠 -{formatPrice(pi.discounted_price)}</Text>
              </>
            )}
          </div>
        );
      },
    },
    {
      title: '订单状态',
      key: 'status',
      width: 170,
      render: (_: unknown, record: Order) => {
        const cfg = STATUS_CONFIG[record.status] || { color: 'default', text: `未知(${record.status})` };
        const payInfo = record.order_detail?.pay_info;
        const deliveryInfos = record.order_detail?.delivery_info?.delivery_product_info;
        const product = firstProduct(record);

        return (
          <div>
            <Tag color={cfg.color} style={{ marginBottom: 4 }}>{cfg.text}</Tag>
            {payInfo?.payment_method && (
              <Text type="secondary" style={{ fontSize: 12 }}>{PAYMENT_METHOD[payInfo.payment_method] || `支付方式${payInfo.payment_method}`}</Text>
            )}
            {record.status === OrderStatusEnum.PendingShipment && product?.delivery_deadline && (
              <div style={{ fontSize: 12, color: '#fa8c16' }}>
                发货时限: {formatTime(product.delivery_deadline)}
              </div>
            )}
            {record.status === OrderStatusEnum.PendingShipment && (
              <Button size="small" type="primary" icon={<SendOutlined />} style={{ marginTop: 4, fontSize: 12 }} onClick={() => {
                setShipModalOpen(true);
                setShipUrl('');
              }}>
                淘宝发货
              </Button>
            )}
            {(record.status === OrderStatusEnum.PendingReceipt || record.status === OrderStatusEnum.Completed) && deliveryInfos?.length > 0 && (
              <>
                {deliveryInfos.map((d, i) => (
                  <div key={i} style={{ borderTop: i > 0 ? '1px dashed #f0f0f0' : undefined, paddingTop: i > 0 ? 4 : 0, marginTop: i > 0 ? 4 : 0 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{d.delivery_name || d.delivery_id}</Text>
                    <div style={{ fontSize: 12, color: '#333' }}>{d.waybill_id}</div>
                    {d.delivery_time > 0 && <Text type="secondary" style={{ fontSize: 12 }}>发货: {formatTime(d.delivery_time)}</Text>}
                  </div>
                ))}
              </>
            )}
          </div>
        );
      },
    },
    {
      title: '收货地址',
      key: 'address',
      width: 180,
      render: (_: unknown, record: Order) => {
        const masked = record.order_detail?.delivery_info?.address_info;
        const real = decodedAddresses[record.order_id];
        const addr = real || masked;
        if (!addr) return '-';
        const fullAddr = `${addr.province_name || ''}${addr.city_name || ''}${addr.county_name || ''}${addr.detail_info || ''}`;
        const isDecoded = !!real;
        const isDecoding = decodingOrderIds.has(record.order_id);
        return (
          <div>
            <div style={{ fontSize: 12, color: '#333' }}>{addr.user_name} {addr.tel_number}</div>
            <Text type="secondary" style={{ fontSize: 12 }} title={fullAddr}>
              {fullAddr.length > 25 ? fullAddr.substring(0, 25) + '...' : fullAddr}
            </Text>
            {!isDecoded && canDecodeAddress(record.status) && (
              <Button type="link" size="small" loading={isDecoding} onClick={() => handleDecodeAddress(record.order_id)} style={{ padding: 0, height: 'auto', fontSize: 12 }}>
                查看真实地址
              </Button>
            )}
            {isDecoded && (
              <Button type="link" size="small" onClick={() => handleCopyAddress(real!)} style={{ padding: 0, height: 'auto', fontSize: 12 }}>
                复制地址
              </Button>
            )}
          </div>
        );
      },
    },
    {
      title: '备注',
      key: 'notes',
      width: 140,
      render: (_: unknown, record: Order) => {
        const ext = record.order_detail?.ext_info;
        if (!ext) return <Text type="secondary">无</Text>;
        const hasCustomer = ext.customer_notes && ext.customer_notes.trim();
        const hasMerchant = ext.merchant_notes && ext.merchant_notes.trim();
        if (!hasCustomer && !hasMerchant) return <Text type="secondary">无</Text>;
        return (
          <div>
            {hasCustomer && (
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>买家: </Text>
                <Text style={{ fontSize: 12 }} title={ext.customer_notes}>
                  {ext.customer_notes!.length > 15 ? ext.customer_notes!.substring(0, 15) + '...' : ext.customer_notes}
                </Text>
              </div>
            )}
            {hasMerchant && (
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>商家: </Text>
                <Text style={{ fontSize: 12, color: '#1890ff' }} title={ext.merchant_notes}>
                  {ext.merchant_notes!.length > 15 ? ext.merchant_notes!.substring(0, 15) + '...' : ext.merchant_notes}
                </Text>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 70,
      render: (_: unknown, record: Order) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.order_id)}>
          详情
        </Button>
      ),
    },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Flex vertical gap={8} style={{ flexShrink: 0, borderBottom: '1px solid #f0f0f0', paddingBottom: 10 }}>
        <Tag.CheckableTagGroup
          options={STATUS_FILTER_OPTIONS}
          value={activeStatus ?? 'all'}
          onChange={handleStatusChange}
        />
        <Flex gap={8} align="center">
          <Space.Compact style={{ flex: 1, maxWidth: 480 }}>
            <Select size="small" value={searchType} onChange={setSearchType} options={SEARCH_TYPE_OPTIONS} style={{ width: 120 }} />
            <Input.Search
              size="small"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onSearch={handleSearch}
              placeholder="输入关键字搜索"
              allowClear
              style={{ width: '100%' }}
              enterButton="搜索"
            />
          </Space.Compact>
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => fetchOrders(activeStatus)}>刷新</Button>
          <Button size="small" icon={<LoginOutlined />} onClick={() => openExternal('https://member1.taobao.com/member/fresh/account_security.htm')}>淘宝登录</Button>
          <Button size="small" icon={<SendOutlined />} onClick={() => openExternal('https://detail.tmall.com/item.htm?id=771068071648')}>发货测试</Button>
          <Text type="secondary" style={{ fontSize: 12 }}>仅显示近7天订单</Text>
        </Flex>
        {error && (
          <Alert type="error" title={error} showIcon closable={{ onClose: clearError }} />
        )}
      </Flex>

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

      <Modal
        title="订单详情"
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={null}
        width={720}
        destroyOnHidden
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : detailOrder ? (
          <Flex vertical gap={16}>
            <Descriptions
              size="small"
              column={2}
              bordered
              items={[
                { key: 'orderId', label: '订单号', children: detailOrder.order_id },
                {
                  key: 'status',
                  label: '状态',
                  children: <Tag color={(STATUS_CONFIG[detailOrder.status] || {}).color}>{(STATUS_CONFIG[detailOrder.status] || { text: `未知(${detailOrder.status})` }).text}</Tag>,
                },
                { key: 'createTime', label: '下单时间', children: formatTime(detailOrder.create_time) },
                { key: 'updateTime', label: '更新时间', children: formatTime(detailOrder.update_time) },
              ]}
            />

            {detailOrder.order_detail?.product_infos && (
              <div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>商品信息</div>
                {detailOrder.order_detail.product_infos.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid #f0f0f0', alignItems: 'center' }}>
                    {p.thumb_img && <Image src={p.thumb_img} width={50} height={50} alt={p.title || '商品图片'} style={{ borderRadius: 4, objectFit: 'cover' }} preview={false} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {p.sku_attrs?.map(a => `${a.attr_key}: ${a.attr_value}`).join(' / ')}
                      </Text>
                      <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                        <Flex gap={16}>
                          <span>数量: {p.sku_cnt}</span>
                          <span>单价: {formatPrice(p.sale_price)}</span>
                          <span>实付: {formatPrice(p.real_price)}</span>
                        </Flex>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {detailOrder.order_detail?.price_info && (
              <Descriptions
                size="small"
                column={2}
                bordered
                title="价格信息"
                items={[
                  { key: 'productPrice', label: '商品总价', children: formatPrice(detailOrder.order_detail.price_info.product_price) },
                  { key: 'orderPrice', label: '实付金额', children: formatPrice(detailOrder.order_detail.price_info.order_price) },
                  { key: 'freight', label: '运费', children: formatPrice(detailOrder.order_detail.price_info.freight) },
                  { key: 'discount', label: '优惠', children: formatPrice(detailOrder.order_detail.price_info.discounted_price) },
                  { key: 'merchantReceive', label: '商家实收', children: formatPrice(detailOrder.order_detail.price_info.merchant_receieve_price), span: 2 },
                ]}
              />
            )}

            {detailOrder.order_detail?.delivery_info?.address_info && (
              <Descriptions
                size="small"
                column={1}
                bordered
                title="收货信息"
                items={[
                  { key: 'userName', label: '收货人', children: detailOrder.order_detail.delivery_info.address_info.user_name },
                  { key: 'telNumber', label: '电话', children: detailOrder.order_detail.delivery_info.address_info.tel_number },
                  {
                    key: 'address',
                    label: '地址',
                    children: `${detailOrder.order_detail.delivery_info.address_info.province_name}${detailOrder.order_detail.delivery_info.address_info.city_name}${detailOrder.order_detail.delivery_info.address_info.county_name}${detailOrder.order_detail.delivery_info.address_info.detail_info}`,
                  },
                ]}
              />
            )}

            {detailOrder.order_detail?.delivery_info?.delivery_product_info?.length > 0 && (
              <Descriptions
                size="small"
                column={2}
                bordered
                title="物流信息"
                items={detailOrder.order_detail.delivery_info.delivery_product_info.flatMap((d, i) => [
                  { key: `deliveryName${i}`, label: '快递公司', children: d.delivery_name || d.delivery_id },
                  { key: `waybillId${i}`, label: '快递单号', children: d.waybill_id },
                ])}
              />
            )}

            {detailOrder.order_detail?.ext_info && (
              <Descriptions
                size="small"
                column={1}
                bordered
                title="备注"
                items={[
                  { key: 'customerNotes', label: '买家备注', children: detailOrder.order_detail.ext_info.customer_notes || '无' },
                  { key: 'merchantNotes', label: '商家备注', children: detailOrder.order_detail.ext_info.merchant_notes || '无' },
                ]}
              />
            )}

            {detailOrder.order_detail?.pay_info && (
              <Descriptions
                size="small"
                column={2}
                bordered
                title="支付信息"
                items={[
                  { key: 'payTime', label: '支付时间', children: formatTime(detailOrder.order_detail.pay_info.pay_time) },
                  { key: 'transactionId', label: '交易号', children: detailOrder.order_detail.pay_info.transaction_id || '-' },
                ]}
              />
            )}
          </Flex>
        ) : (
          <Empty description="获取订单详情失败" />
        )}
      </Modal>

      <Modal
        title="淘宝发货"
        open={shipModalOpen}
        onCancel={() => setShipModalOpen(false)}
        onOk={() => {
          if (shipUrl.trim()) {
            openExternal(shipUrl.trim());
            setShipModalOpen(false);
          }
        }}
        okText="去发货"
        okButtonProps={{ disabled: !shipUrl.trim() }}
        destroyOnHidden
      >
        <Input
          placeholder="粘贴淘宝商品链接"
          value={shipUrl}
          onChange={(e) => setShipUrl(e.target.value)}
          onPressEnter={() => {
            if (shipUrl.trim()) {
              openExternal(shipUrl.trim());
              setShipModalOpen(false);
            }
          }}
        />
      </Modal>
    </div>
  );
};

export default React.memo(Orders);
