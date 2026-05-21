import React from 'react';
import { Alert, Button, Flex, Input, Select, Space, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { OrderSearchParams, OrderStatus, OrderTimeScope } from '../../../shared/types';
import { OrderStatus as OrderStatusEnum } from '../../../shared/types';

const { Text } = Typography;

export const STATUS_FILTER_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '待付款', value: OrderStatusEnum.PendingPayment },
  { label: '待发货', value: OrderStatusEnum.PendingShipment },
  { label: '已发货', value: OrderStatusEnum.PendingReceipt },
  { label: '已完成', value: OrderStatusEnum.Completed },
];

export const SEARCH_TYPE_OPTIONS = [
  { value: 'order_id', label: '订单号' },
  { value: 'title', label: '商品标题' },
  { value: 'user_name', label: '收件人' },
  { value: 'merchant_notes', label: '商家备注' },
  { value: 'customer_notes', label: '买家备注' },
];

export const TIME_SCOPE_OPTIONS: { value: OrderTimeScope; label: string }[] = [
  { value: 'all', label: '全部时间' },
  { value: '7d', label: '近7天' },
  { value: '30d', label: '近30天' },
  { value: '90d', label: '近90天' },
];

interface Props {
  activeStatus: OrderStatus | undefined;
  timeScope: OrderTimeScope;
  searchActive: boolean;
  searchType: OrderSearchParams['search_type'];
  searchKeyword: string;
  loading: boolean;
  error: string | null;
  onStatusChange: (value: string | number | null) => void;
  onTimeScopeChange: (value: OrderTimeScope) => void;
  onSearchTypeChange: (value: OrderSearchParams['search_type']) => void;
  onSearchKeywordChange: (value: string) => void;
  onSearch: (value: string) => void;
  onRefresh: () => void;
  onClearError: () => void;
}

export const OrderToolbar: React.FC<Props> = ({
  activeStatus,
  timeScope,
  searchActive,
  searchType,
  searchKeyword,
  loading,
  error,
  onStatusChange,
  onTimeScopeChange,
  onSearchTypeChange,
  onSearchKeywordChange,
  onSearch,
  onRefresh,
  onClearError,
}) => {
  return (
    <Flex vertical gap={8} style={{ flexShrink: 0, borderBottom: '1px solid #f0f0f0', paddingBottom: 10 }}>
      <Tag.CheckableTagGroup
        options={STATUS_FILTER_OPTIONS}
        value={activeStatus ?? 'all'}
        onChange={onStatusChange}
      />
      <Flex gap={8} align="center">
        <Space.Compact style={{ flex: 1, maxWidth: 480 }}>
          <Select
            size="small"
            value={searchType}
            onChange={onSearchTypeChange}
            options={SEARCH_TYPE_OPTIONS}
            style={{ width: 120 }}
          />
          <Input.Search
            size="small"
            value={searchKeyword}
            onChange={(e) => onSearchKeywordChange(e.target.value)}
            onSearch={onSearch}
            placeholder="输入关键字搜索"
            allowClear
            style={{ width: '100%' }}
            enterButton="搜索"
          />
        </Space.Compact>
        <Select
          size="small"
          value={timeScope}
          onChange={onTimeScopeChange}
          options={TIME_SCOPE_OPTIONS}
          disabled={searchActive}
          style={{ width: 112 }}
        />
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={onRefresh}>刷新</Button>
        <Text type="secondary" style={{ fontSize: 12 }}>列表每页加载 50 条；搜索不受时间范围限制</Text>
      </Flex>
      {error && (
        <Alert type="error" title={error} showIcon closable={{ onClose: onClearError }} />
      )}
    </Flex>
  );
};
