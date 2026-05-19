import React, { useCallback } from 'react';
import { Button, Empty, Flex, Input, InputNumber, Modal, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons';
import type { OrderProductInfo, ProductSourceItem } from '../../../shared/types';

const { Text } = Typography;

interface SourceManagementModalProps {
  open: boolean;
  product: OrderProductInfo | null;
  rows: ProductSourceItem[];
  saving: boolean;
  onRowsChange: (rows: ProductSourceItem[]) => void;
  onCancel: () => void;
  onSave: () => void;
}

interface ShippingSourceModalProps {
  open: boolean;
  product: OrderProductInfo | null;
  sources: ProductSourceItem[];
  onCancel: () => void;
  onOpenShipping: (source: ProductSourceItem) => void;
}

const createEmptySource = (): ProductSourceItem => ({
  id: crypto.randomUUID(),
  url: '',
  quantity: 1,
  remark: '',
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export const SourceManagementModal: React.FC<SourceManagementModalProps> = ({
  open,
  product,
  rows,
  saving,
  onRowsChange,
  onCancel,
  onSave,
}) => {
  const updateRow = useCallback((sourceId: string, patch: Partial<ProductSourceItem>) => {
    onRowsChange(rows.map(source => source.id === sourceId ? { ...source, ...patch, updatedAt: Date.now() } : source));
  }, [onRowsChange, rows]);

  const addRow = useCallback(() => {
    onRowsChange([...rows, createEmptySource()]);
  }, [onRowsChange, rows]);

  const removeRow = useCallback((sourceId: string) => {
    const next = rows.filter(source => source.id !== sourceId);
    onRowsChange(next.length > 0 ? next : [createEmptySource()]);
  }, [onRowsChange, rows]);

  return (
    <Modal
      title={`管理货源${product?.title ? ` - ${product.title}` : ''}`}
      open={open}
      onCancel={onCancel}
      onOk={onSave}
      okText="保存"
      confirmLoading={saving}
      width={780}
      destroyOnHidden
    >
      <Flex vertical gap={10}>
        {rows.map(source => (
          <Flex key={source.id} gap={8} align="center">
            <Input
              placeholder="货源链接"
              value={source.url}
              onChange={(e) => updateRow(source.id, { url: e.target.value })}
              style={{ flex: 1 }}
            />
            <InputNumber
              min={1}
              precision={0}
              value={source.quantity}
              onChange={(value) => updateRow(source.id, { quantity: value || 1 })}
              style={{ width: 90 }}
              placeholder="数量"
            />
            <Input
              placeholder="备注"
              value={source.remark}
              onChange={(e) => updateRow(source.id, { remark: e.target.value })}
              style={{ width: 160 }}
            />
            <Button danger type="text" icon={<DeleteOutlined />} onClick={() => removeRow(source.id)} />
          </Flex>
        ))}
        <Button icon={<PlusOutlined />} onClick={addRow}>
          新增货源
        </Button>
      </Flex>
    </Modal>
  );
};

export const ShippingSourceModal: React.FC<ShippingSourceModalProps> = ({
  open,
  product,
  sources,
  onCancel,
  onOpenShipping,
}) => {
  return (
    <Modal
      title={`选择货源${product?.title ? ` - ${product.title}` : ''}`}
      open={open}
      onCancel={onCancel}
      footer={null}
      width={760}
      destroyOnHidden
    >
      <Flex vertical gap={8}>
        {sources.map(source => (
          <Flex key={source.id} gap={8} align="center" style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text ellipsis style={{ display: 'block' }} title={source.url}>{source.url}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                数量: {source.quantity}{source.remark ? ` ｜ ${source.remark}` : ''}
              </Text>
            </div>
            <Button
              size="small"
              type="primary"
              icon={<SendOutlined />}
              onClick={() => onOpenShipping(source)}
            >
              去发货
            </Button>
          </Flex>
        ))}
        {sources.length === 0 && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可用货源" />
        )}
      </Flex>
    </Modal>
  );
};

export function newProductSourceRow(): ProductSourceItem {
  return createEmptySource();
}
