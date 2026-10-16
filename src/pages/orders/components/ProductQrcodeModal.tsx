import React from 'react';
import { Button, Image, Modal, Space, Typography } from 'antd';
import { CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import type { OrderProductInfo, ProductQrcodeResult } from '../../../shared/types';
import { wrappingProductTextStyle } from './product-text-styles';

const { Text } = Typography;

interface ProductQrcodeModalProps {
  open: boolean;
  loading: boolean;
  product: OrderProductInfo | null;
  qrcode: ProductQrcodeResult | null;
  onCancel: () => void;
  onCopyLink: (url?: string) => void;
  onCopyImage: (url?: string) => void;
}

export function ProductQrcodeModal({
  open,
  loading,
  product,
  qrcode,
  onCancel,
  onCopyLink,
  onCopyImage,
}: ProductQrcodeModalProps) {
  const qrcodeUrl = qrcode?.qrcodeUrl;

  return (
    <Modal
      open={open}
      title="商品二维码"
      width={420}
      footer={null}
      destroyOnHidden
      onCancel={onCancel}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {product?.thumb_img && (
            <Image
              src={product.thumb_img}
              width={48}
              height={48}
              alt={product.title || '商品图片'}
              preview={false}
              style={{ borderRadius: 4, objectFit: 'cover', flexShrink: 0 }}
            />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ ...wrappingProductTextStyle, fontWeight: 600 }}>{product?.title || '未命名商品'}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>商品ID：{product?.product_id || '-'}</Text>
          </div>
        </div>

        <div
          style={{
            minHeight: 260,
            display: 'grid',
            placeItems: 'center',
            border: '1px solid #f0f0f0',
            borderRadius: 6,
            background: '#fff',
            padding: 16,
          }}
        >
          {qrcodeUrl ? (
            <Image
              src={qrcodeUrl}
              width={240}
              alt={product?.title ? `${product.title} 商品二维码` : '商品二维码'}
              preview={{ mask: { blur: false } }}
              style={{ display: 'block' }}
            />
          ) : (
            <Text type="secondary">{loading ? '正在获取二维码...' : '暂无二维码'}</Text>
          )}
        </div>

        <Space wrap>
          <Button
            icon={<CopyOutlined />}
            disabled={!qrcodeUrl}
            onClick={() => onCopyLink(qrcodeUrl)}
          >
            复制链接
          </Button>
          <Button
            icon={<CopyOutlined />}
            disabled={!qrcodeUrl}
            onClick={() => onCopyImage(qrcodeUrl)}
          >
            复制图片
          </Button>
          <Button
            icon={<DownloadOutlined />}
            disabled={!qrcodeUrl}
            href={qrcodeUrl}
            target="_blank"
          >
            打开原图
          </Button>
        </Space>
      </div>
    </Modal>
  );
}
