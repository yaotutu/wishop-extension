import React, { useEffect, useMemo, useState } from 'react';
import { DeleteOutlined, EyeOutlined, ImportOutlined, ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Image,
  Input,
  message,
  Popconfirm,
  Space,
  Table,
  Tag,
} from 'antd';
import type { TableProps } from 'antd';
import { queryKeys } from '../../query/query-keys';
import { extensionApi } from '../../shared/extension-api';
import type { CollectedProductListing, ProductListingCollectionSession } from '../../shared/types';

const missingFieldLabels: Record<string, string> = {
  title: '标题',
  mainImages: '主图',
  detailImages: '详情图',
  skuMatrix: 'SKU',
  productParams: '商品参数',
};

const pageStyle: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const imageGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
  gap: 8,
};

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN');
}

function skuSummary(listing: CollectedProductListing): string {
  return listing.skuGroups.map(group => `${group.name} ${group.values.length}`).join(' / ') || '-';
}

function statusTags(listing: CollectedProductListing): React.ReactNode {
  if (listing.missingFields.length === 0) return <Tag color="green">完整</Tag>;
  return (
    <Space size={4} wrap>
      {listing.missingFields.map(field => (
        <Tag key={field} color="orange">
          缺 {missingFieldLabels[field] || field}
        </Tag>
      ))}
    </Space>
  );
}

const ProductListingPage: React.FC = () => {
  const [form] = Form.useForm<{ url: string }>();
  const queryClient = useQueryClient();
  const [activeSession, setActiveSession] = useState<ProductListingCollectionSession | null>(null);
  const [previewListing, setPreviewListing] = useState<CollectedProductListing | null>(null);

  const listingsQuery = useQuery({
    queryKey: queryKeys.productListingCollection.list,
    queryFn: () => extensionApi.productListingCollection.list(),
  });

  const collectMutation = useMutation({
    mutationFn: (url: string) => extensionApi.productListingCollection.open({ url }),
    onSuccess: session => {
      setActiveSession(session);
      message.success('已打开淘宝工作页采集商品');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (listingId: string) => extensionApi.productListingCollection.remove(listingId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.productListingCollection.list });
      setPreviewListing(null);
      message.success('采集记录已删除');
    },
  });

  useEffect(() => {
    const cleanupCompleted = extensionApi.productListingCollection.onCompleted(listing => {
      setActiveSession(null);
      setPreviewListing(listing);
      queryClient.setQueryData<CollectedProductListing[]>(
        queryKeys.productListingCollection.list,
        current => [listing, ...(current || []).filter(item => item.id !== listing.id)],
      );
      message.success('商品采集完成');
    });
    const cleanupFailed = extensionApi.productListingCollection.onFailed(payload => {
      setActiveSession(null);
      message.error(payload.error || '商品采集失败');
    });
    const cleanupChallenge = extensionApi.productListingCollection.onChallenge(payload => {
      message.warning(payload.reason || '淘宝工作页需要登录或安全验证');
    });
    return () => {
      cleanupCompleted();
      cleanupFailed();
      cleanupChallenge();
    };
  }, [queryClient]);

  const columns = useMemo<TableProps<CollectedProductListing>['columns']>(() => [
    {
      title: '商品',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (_: string, record) => (
        <Space size={10}>
          <Image
            src={record.mainImages[0]}
            width={48}
            height={48}
            alt={record.title}
            preview={false}
            styles={{ root: { objectFit: 'cover', borderRadius: 4, background: '#f6f8fa' } }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>
              {record.title || record.itemId}
            </div>
            <div style={{ color: '#6b7280', fontSize: 12 }}>
              {record.shopName || '-'} · {record.itemId}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: '价格',
      dataIndex: 'priceRangeText',
      key: 'priceRangeText',
      width: 110,
      render: (value: string) => value || '-',
    },
    {
      title: 'SKU',
      key: 'sku',
      width: 180,
      render: (_: unknown, record) => (
        <div>
          <div>{record.skuMatrix.length} 个 SKU</div>
          <div style={{ color: '#6b7280', fontSize: 12 }}>{skuSummary(record)}</div>
        </div>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 180,
      render: (_: unknown, record) => statusTags(record),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (value: number) => formatTime(value),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: unknown, record) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setPreviewListing(record)}>
            查看
          </Button>
          <Popconfirm
            title="删除采集记录？"
            description="只删除本地采集数据，不影响淘宝商品。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => removeMutation.mutate(record.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ], [removeMutation]);

  const handleCollect = async (values: { url: string }) => {
    await collectMutation.mutateAsync(values.url.trim());
  };

  return (
    <div style={pageStyle}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>上货管理</h2>
        <p style={{ margin: '8px 0 0', color: '#666', fontSize: 13 }}>
          从淘宝商品详情页采集标题、图片、参数和 SKU，先保存为本地上货数据。
        </p>
      </div>

      <Card size="small" title="商品采集">
        <Form form={form} layout="inline" onFinish={handleCollect} style={{ gap: 8 }}>
          <Form.Item
            name="url"
            style={{ flex: 1, minWidth: 360 }}
            rules={[{ required: true, message: '请输入淘宝或天猫商品链接' }]}
          >
            <Input
              allowClear
              placeholder="https://item.taobao.com/item.htm?id=..."
              disabled={collectMutation.isPending}
            />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              icon={<ImportOutlined />}
              loading={collectMutation.isPending}
            >
              采集商品
            </Button>
          </Form.Item>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => listingsQuery.refetch()}
            loading={listingsQuery.isFetching}
          >
            刷新
          </Button>
        </Form>
        {activeSession && (
          <div style={{ marginTop: 10, color: '#6b7280', fontSize: 13 }}>
            当前任务：{activeSession.status} · {activeSession.url}
          </div>
        )}
      </Card>

      <Card size="small" title="本地采集商品" style={{ flex: 1, minHeight: 0 }}>
        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={listingsQuery.data || []}
          loading={listingsQuery.isLoading}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 980 }}
        />
      </Card>

      <Drawer
        title={previewListing?.title || '采集详情'}
        open={Boolean(previewListing)}
        size={880}
        destroyOnHidden
        onClose={() => setPreviewListing(null)}
      >
        {previewListing && (
          <Space vertical size={16} style={{ width: '100%' }}>
            <Descriptions
              size="small"
              bordered
              column={2}
              items={[
                { label: '商品 ID', children: previewListing.itemId },
                { label: '平台', children: previewListing.platform },
                { label: '店铺', children: previewListing.shopName || '-' },
                { label: '价格', children: previewListing.priceRangeText || '-' },
                { label: '销量', children: previewListing.salesText || '-' },
                { label: '发货', children: previewListing.deliveryText || '-' },
              ]}
            />
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>主图</h3>
              <Image.PreviewGroup>
                <div style={imageGridStyle}>
                  {previewListing.mainImages.map(url => (
                    <Image key={url} src={url} width="100%" height={72} alt="商品主图" styles={{ root: { objectFit: 'cover' } }} />
                  ))}
                </div>
              </Image.PreviewGroup>
            </div>
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>商品参数</h3>
              <Table
                rowKey={record => `${record.group}:${record.name}`}
                size="small"
                pagination={false}
                dataSource={previewListing.productParams}
                columns={[
                  { title: '分组', dataIndex: 'group', width: 100 },
                  { title: '参数', dataIndex: 'name', width: 220 },
                  { title: '值', dataIndex: 'value' },
                ]}
              />
            </div>
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>SKU 矩阵</h3>
              <Table
                rowKey="id"
                size="small"
                pagination={{ pageSize: 8, showSizeChanger: false }}
                dataSource={previewListing.skuMatrix}
                columns={[
                  {
                    title: '规格',
                    key: 'specs',
                    render: (_: unknown, record) => record.specs.map(spec => `${spec.name}:${spec.value}`).join(' / '),
                  },
                  { title: '价格', dataIndex: 'priceText', width: 120 },
                  { title: '库存', dataIndex: 'stockText', width: 120 },
                  { title: '发货', dataIndex: 'logisticsTime', width: 220 },
                ]}
              />
            </div>
          </Space>
        )}
      </Drawer>
    </div>
  );
};

export default ProductListingPage;
