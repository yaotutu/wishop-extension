import React from 'react';
import { Button, Flex, Image, Space, Tag, Typography } from 'antd';
import { CopyOutlined, EyeOutlined, LinkOutlined, PictureOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import type { Order, OrderAssociation, OrderProductInfo, OrderRealAddressCache, ProductSourceItem } from '../../../shared/types';
import { OrderStatus as OrderStatusEnum } from '../../../shared/types';
import { formatOrderAddressLine, getOrderPhoneDisplay } from '../../../shared/address-format';
import { firstProduct, formatPrice, formatTime, hasAddressInfo, PAYMENT_METHOD, STATUS_CONFIG } from '../order-display';

const { Text } = Typography;

interface CreateOrderColumnsOptions {
  realAddressCaches: Record<string, OrderRealAddressCache>;
  decodingOrderIds: Set<string>;
  productSources: Record<string, ProductSourceItem[]>;
  orderAssociations: Record<string, OrderAssociation>;
  onCopyText: (text: string | undefined, label: string) => void;
  onCopyImage: (imageUrl?: string) => void;
  onCopyAddress: (cache: OrderRealAddressCache) => void;
  onDecodeAddress: (orderId: string) => void;
  onRefreshAddress: (orderId: string) => void;
  onViewDetail: (orderId: string) => void;
  onOpenSourceManager: (product: OrderProductInfo) => void;
  onOpenShipSources: (order: Order, product: OrderProductInfo) => void;
  onEditAssociation: (order: Order) => void;
}

/**
 * Table columns are generated from explicit page actions. This keeps the
 * Orders page responsible for state changes while this module owns only the
 * dense, repetitive cell rendering.
 */
export function createOrderColumns(options: CreateOrderColumnsOptions) {
  return [
    {
      title: '订单信息',
      key: 'order_info',
      width: 280,
      render: (_: unknown, record: Order) => {
        const product = firstProduct(record);
        const ext = record.order_detail?.ext_info;
        const customerNote = ext?.customer_notes?.trim();
        const merchantNote = ext?.merchant_notes?.trim();
        const specs = product?.sku_attrs?.map(a => a.attr_value).filter(Boolean).join(', ') || '';
        return (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            {product?.thumb_img && (
              <Image src={product.thumb_img} width={50} height={50} alt={product.title || '商品图片'} style={{ borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} preview={false} />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <Space size={4} align="center">
                <Text
                  type="secondary"
                  onClick={() => options.onCopyText(record.order_id, '订单号')}
                  style={{ fontSize: 12, cursor: 'pointer' }}
                >
                  {record.order_id}
                </Text>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => options.onCopyText(record.order_id, '订单号')}
                  style={{ width: 18, height: 18, minWidth: 18, padding: 0 }}
                />
              </Space>
              <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product?.title || '-'}</div>
              <Space size={4} style={{ marginTop: 2 }}>
                <Button
                  type="link"
                  size="small"
                  icon={<PictureOutlined />}
                  disabled={!product?.thumb_img}
                  onClick={() => options.onCopyImage(product?.thumb_img)}
                  style={{ padding: 0, height: 20, fontSize: 12 }}
                >
                  复制图片
                </Button>
                <Button
                  type="link"
                  size="small"
                  icon={<CopyOutlined />}
                  disabled={!product?.title}
                  onClick={() => options.onCopyText(product?.title, '标题')}
                  style={{ padding: 0, height: 20, fontSize: 12 }}
                >
                  复制标题
                </Button>
              </Space>
              <br />
              {product && (
                <Text
                  type="secondary"
                  onClick={() => options.onCopyText(specs || undefined, '规格')}
                  style={{ fontSize: 12, cursor: specs ? 'pointer' : 'default', maxWidth: 185, display: 'block' }}
                  ellipsis
                  title={specs || '无规格'}
                >
                  规格: {specs || '无规格'} ｜ x{product.sku_cnt}
                </Text>
              )}
              {product?.sku_code && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
                  <Text
                    type="secondary"
                    onClick={() => options.onCopyText(product.sku_code, 'SKU')}
                    style={{ fontSize: 12, cursor: 'pointer', maxWidth: 145 }}
                    ellipsis
                    title={`编码: ${product.sku_code}`}
                  >
                    编码: {product.sku_code}
                  </Text>
                  <Button
                    type="link"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => options.onCopyText(product.sku_code, 'SKU')}
                    style={{ width: 18, height: 18, minWidth: 18, padding: 0, flexShrink: 0 }}
                  />
                </span>
              )}
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>下单: {formatTime(record.create_time)}</Text>
              <div style={{ marginTop: 4, display: 'grid', gap: 2 }}>
                {customerNote && (
                  <Text style={{ fontSize: 12, color: '#cf1322' }} title={customerNote}>
                    买家备注：{customerNote.length > 28 ? `${customerNote.substring(0, 28)}...` : customerNote}
                  </Text>
                )}
                {merchantNote && (
                  <Text style={{ fontSize: 12, color: '#d4380d' }} title={merchantNote}>
                    卖家备注：{merchantNote.length > 28 ? `${merchantNote.substring(0, 28)}...` : merchantNote}
                  </Text>
                )}
              </div>
            </div>
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
        const real = options.realAddressCaches[record.order_id];
        const addr = real?.address || masked;
        if (!addr) return '-';
        const fullAddr = formatOrderAddressLine(addr);
        const phone = getOrderPhoneDisplay(addr);
        const isDecoded = !!real;
        const isDecoding = options.decodingOrderIds.has(record.order_id);
        const fetchedAt = real ? new Date(real.fetchedAt).toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }) : '';
        return (
          <div>
            <div style={{ fontSize: 12, color: '#333' }}>{addr.user_name}</div>
            <div style={{ fontSize: 12, color: phone.isVirtual ? '#1677ff' : '#333' }}>
              {phone.label}：{phone.value || '-'}
            </div>
            <Text
              type="secondary"
              style={{ fontSize: 12, display: 'block', whiteSpace: isDecoded ? 'normal' : 'nowrap' }}
              title={fullAddr}
            >
              {isDecoded || fullAddr.length <= 25 ? fullAddr : `${fullAddr.substring(0, 25)}...`}
            </Text>
            {isDecoded && (
              <div style={{ fontSize: 12, color: '#8c8c8c' }}>获取：{fetchedAt}</div>
            )}
            {!isDecoded && hasAddressInfo(record) && (
              <Button type="link" size="small" loading={isDecoding} onClick={() => options.onDecodeAddress(record.order_id)} style={{ padding: 0, height: 'auto', fontSize: 12 }}>
                查看真实地址
              </Button>
            )}
            {isDecoded && (
              <Space size={6}>
                <Button type="link" size="small" onClick={() => options.onCopyAddress(real)} style={{ padding: 0, height: 'auto', fontSize: 12 }}>
                  复制地址
                </Button>
                <Button type="link" size="small" loading={isDecoding} onClick={() => options.onRefreshAddress(record.order_id)} style={{ padding: 0, height: 'auto', fontSize: 12 }}>
                  刷新
                </Button>
              </Space>
            )}
          </div>
        );
      },
    },
    {
      title: '采购单详情',
      key: 'purchase_detail',
      width: 190,
      render: (_: unknown, record: Order) => {
        const association = options.orderAssociations[record.order_id];
        const linked = association?.linkedOrders[0];
        const internalRemark = association?.internalRemark?.trim();
        return (
          <div style={{ display: 'grid', gap: 3 }}>
            {internalRemark && (
              <Text style={{ fontSize: 12, color: '#cf1322' }} title={internalRemark}>
                采购备注：{internalRemark.length > 22 ? `${internalRemark.substring(0, 22)}...` : internalRemark}
              </Text>
            )}
            {linked ? (
              <>
                <Text style={{ fontSize: 12, color: '#0958d9' }} title={linked.platformOrderId}>
                  {linked.platform === 'taobao' ? '淘宝' : linked.platform}：{linked.platformOrderId || '-'}
                </Text>
                {linked.platformOrderStatus && (
                  <Text type="secondary" style={{ fontSize: 12 }}>状态：{linked.platformOrderStatus}</Text>
                )}
                {linked.logisticsStatus && (
                  <Text type="secondary" style={{ fontSize: 12 }}>物流：{linked.logisticsStatus}</Text>
                )}
                {linked.trackingNumber && (
                  <Text type="secondary" style={{ fontSize: 12 }} title={linked.trackingNumber}>
                    单号：{linked.trackingNumber.length > 18 ? `${linked.trackingNumber.substring(0, 18)}...` : linked.trackingNumber}
                  </Text>
                )}
              </>
            ) : (
              !internalRemark && <Text type="secondary" style={{ fontSize: 12 }}>未关联采购单</Text>
            )}
            <Button type="link" size="small" onClick={() => options.onEditAssociation(record)} style={{ padding: 0, height: 18, fontSize: 12, justifySelf: 'start' }}>
              {association ? '编辑采购单详情' : '添加采购单详情'}
            </Button>
          </div>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: unknown, record: Order) => {
        const product = firstProduct(record);
        const sources = product?.product_id ? options.productSources[product.product_id] || [] : [];
        return (
          <Flex vertical align="flex-start">
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => options.onViewDetail(record.order_id)}>
              详情
            </Button>
            <Button
              type="link"
              size="small"
              icon={<LinkOutlined />}
              disabled={!product?.product_id}
              onClick={() => product && options.onOpenSourceManager(product)}
            >
              管理货源
            </Button>
            {product?.product_id && sources.length > 0 && (
              <Button type="link" size="small" icon={<ShoppingCartOutlined />} onClick={() => options.onOpenShipSources(record, product)}>
                去发货
              </Button>
            )}
          </Flex>
        );
      },
    },
  ];
}
