import React from 'react';
import { Descriptions, Empty, Flex, Image, Modal, Space, Spin, Tag, Typography } from 'antd';
import type { Order, OrderRealAddressCache } from '../../../shared/types';
import { formatOrderAddressLine, formatOrderPhoneInline } from '../../../shared/address-format';
import { getOrderAftersaleDisplay } from '../../../shared/order-aftersale';
import { formatPrice, getEstimatedCommissionFee, STATUS_CONFIG } from '../order-display';

const { Text } = Typography;

interface Props {
  open: boolean;
  loading: boolean;
  order: Order | null;
  realAddressCache?: OrderRealAddressCache;
  onCancel: () => void;
}

function formatTime(timestamp: number): string {
  if (!timestamp) return '-';
  const d = new Date(timestamp * 1000);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export const OrderDetailModal: React.FC<Props> = ({ open, loading, order, realAddressCache, onCancel }) => {
  const addressInfo = order
    ? realAddressCache?.address || order.order_detail?.delivery_info?.address_info
    : undefined;
  const fetchedAt = realAddressCache?.fetchedAt
    ? new Date(realAddressCache.fetchedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';
  const estimatedCommissionFee = order ? getEstimatedCommissionFee(order) : undefined;
  const aftersaleDisplay = order ? getOrderAftersaleDisplay(order) : null;

  return (
    <Modal
      title="订单详情"
      open={open}
      onCancel={onCancel}
      footer={null}
      width={720}
      destroyOnHidden
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : order ? (
        <Flex vertical gap={16}>
          <Descriptions
            size="small"
            column={2}
            bordered
            items={[
              { key: 'orderId', label: '订单号', children: order.order_id },
              {
                key: 'status',
                label: '状态',
                children: (
                  <Space size={4} wrap>
                    <Tag color={(STATUS_CONFIG[order.status] || {}).color}>{(STATUS_CONFIG[order.status] || { text: `未知(${order.status})` }).text}</Tag>
                    {aftersaleDisplay && (
                      <Tag color={aftersaleDisplay.color} title={aftersaleDisplay.title}>
                        售后：{aftersaleDisplay.text}
                      </Tag>
                    )}
                  </Space>
                ),
              },
              { key: 'createTime', label: '下单时间', children: formatTime(order.create_time) },
              { key: 'updateTime', label: '更新时间', children: formatTime(order.update_time) },
            ]}
          />

          {order.order_detail?.product_infos && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>商品信息</div>
              {order.order_detail.product_infos.map((p, i) => (
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

          {order.order_detail?.price_info && (
            <Descriptions
              size="small"
              column={2}
              bordered
              title="价格信息"
              items={[
                { key: 'productPrice', label: '商品总价', children: formatPrice(order.order_detail.price_info.product_price) },
                { key: 'orderPrice', label: '实付金额', children: formatPrice(order.order_detail.price_info.order_price) },
                { key: 'freight', label: '运费', children: formatPrice(order.order_detail.price_info.freight) },
                { key: 'discount', label: '优惠', children: formatPrice(order.order_detail.price_info.discounted_price) },
                { key: 'estimatedCommission', label: '预估手续费', children: formatPrice(estimatedCommissionFee) },
                { key: 'merchantReceive', label: '商家实收', children: formatPrice(order.order_detail.price_info.merchant_receieve_price) },
              ]}
            />
          )}

          {addressInfo && (
            <Descriptions
              size="small"
              column={1}
              bordered
              title="收货信息"
              items={[
                { key: 'userName', label: '收货人', children: addressInfo.user_name },
                { key: 'telNumber', label: '联系电话', children: formatOrderPhoneInline(addressInfo) },
                {
                  key: 'address',
                  label: '地址',
                  children: formatOrderAddressLine(addressInfo),
                },
                ...(fetchedAt ? [{ key: 'fetchedAt', label: '获取时间', children: fetchedAt }] : []),
              ]}
            />
          )}

          {order.order_detail?.delivery_info?.delivery_product_info?.length > 0 && (
            <Descriptions
              size="small"
              column={2}
              bordered
              title="物流信息"
              items={order.order_detail.delivery_info.delivery_product_info.flatMap((d, i) => [
                { key: `deliveryName${i}`, label: '快递公司', children: d.delivery_name || d.delivery_id },
                { key: `waybillId${i}`, label: '快递单号', children: d.waybill_id },
              ])}
            />
          )}

          {order.order_detail?.ext_info && (
            <Descriptions
              size="small"
              column={1}
              bordered
              title="备注"
              items={[
                { key: 'customerNotes', label: '买家备注', children: order.order_detail.ext_info.customer_notes || '无' },
                { key: 'merchantNotes', label: '商家备注', children: order.order_detail.ext_info.merchant_notes || '无' },
              ]}
            />
          )}

          {order.order_detail?.pay_info && (
            <Descriptions
              size="small"
              column={2}
              bordered
              title="支付信息"
              items={[
                { key: 'payTime', label: '支付时间', children: formatTime(order.order_detail.pay_info.pay_time) },
                { key: 'transactionId', label: '交易号', children: order.order_detail.pay_info.transaction_id || '-' },
              ]}
            />
          )}
        </Flex>
      ) : (
        <Empty description="获取订单详情失败" />
      )}
    </Modal>
  );
};
