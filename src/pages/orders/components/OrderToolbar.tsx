import React, { useEffect, useState } from 'react';
import { Alert, Button, Flex, Input, Select, Space, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { OrderSearchParams, OrderSearchSource, OrderStatus, OrderSyncState, OrderTimeScope, ScheduledJob } from '../../../shared/types';
import { OrderStatus as OrderStatusEnum } from '../../../shared/types';
import { orderSyncCountdownText } from '../order-sync-countdown';

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
  searchSource: OrderSearchSource;
  searchKeyword: string;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  syncState?: OrderSyncState;
  autoSyncJob?: ScheduledJob;
  onStatusChange: (value: string | number | null) => void;
  onTimeScopeChange: (value: OrderTimeScope) => void;
  onSearchTypeChange: (value: OrderSearchParams['search_type']) => void;
  onSearchSourceChange: (value: OrderSearchSource) => void;
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
  searchSource,
  searchKeyword,
  loading,
  refreshing,
  error,
  syncState,
  autoSyncJob,
  onStatusChange,
  onTimeScopeChange,
  onSearchTypeChange,
  onSearchSourceChange,
  onSearchKeywordChange,
  onSearch,
  onRefresh,
  onClearError,
}) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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
          <Select
            size="small"
            value={searchSource}
            onChange={onSearchSourceChange}
            options={[
              { value: 'local', label: '本地搜索' },
              { value: 'remote', label: '服务器最新' },
            ]}
            style={{ width: 112 }}
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
        <Button size="small" icon={<ReloadOutlined />} loading={refreshing} onClick={onRefresh}>立即更新</Button>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {orderSyncCountdownText({ syncState, autoSyncJob, now })}
        </Text>
      </Flex>
      {error && (
        <Alert type="error" title={error} showIcon closable={{ onClose: onClearError }} />
      )}
    </Flex>
  );
};
