import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CloudUploadOutlined, DeleteOutlined, EyeOutlined, ImportOutlined, ReloadOutlined, RobotOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Image,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Steps,
  Switch,
  Table,
  Tag,
} from 'antd';
import type { TableProps } from 'antd';
import { useAppSettingsQuery } from '../../hooks/useOrderQueries';
import { queryKeys } from '../../query/query-keys';
import { extensionApi } from '../../shared/extension-api';
import type {
  Account,
  CollectedProductListing,
  ProductListingCollectionSession,
  WxProductDraftAttribute,
  WxProductDraftCreationResult,
  WxProductDraftPrepareResult,
  WxProductDraftSuggestionResult,
} from '../../shared/types';

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

const detailImageGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
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

function sourceCategoryText(listing?: Pick<CollectedProductListing, 'sourceCategory'> | null): string {
  const category = listing?.sourceCategory;
  if (!category) return '-';
  return category.path?.join(' / ')
    || category.name
    || (category.id ? `类目ID ${category.id}` : '-');
}

interface ProductListingPageProps {
  accounts: Account[];
  activeAccountId: string;
}

interface WxDraftFormValues {
  accountId: string;
  catIdsText?: string;
  expressTemplateId?: string;
  brandId?: string;
  defaultStockNum: number;
  autoListing?: boolean;
}

function parseCatIds(value?: string): string[] {
  return (value || '')
    .split(/[,\s，、/]+/u)
    .map(item => item.trim())
    .filter(Boolean);
}

function isValidCategoryPathIds(catIds: string[]): boolean {
  return catIds.length >= 3 && catIds.length <= 4;
}

function categoryCandidateSourceText(source?: WxProductDraftSuggestionResult['categoryCandidateSource']): string {
  if (source === 'taobaoWxLookup') return '本地类目 lookup';
  if (source === 'wxApi') return '微信全量类目筛选';
  if (source === 'wxStaticSnapshot') return '静态全量类目';
  return '未记录来源';
}

function categoryCandidateScopeText(
  scope?: NonNullable<WxProductDraftSuggestionResult['categoryLookup']>['candidateScope'],
): string {
  if (scope === 'exact') return '完整路径命中';
  if (scope === 'level3Children') return '三级父类候选';
  if (scope === 'level2Children') return '二级父类候选';
  if (scope === 'level1Children') return '一级父类候选';
  if (scope === 'wxApiFallback') return '微信全量回退';
  if (scope === 'wxStaticAll') return '静态全量类目';
  return '未记录范围';
}

const ProductListingPage: React.FC<ProductListingPageProps> = ({ accounts, activeAccountId }) => {
  const [form] = Form.useForm<{ url: string }>();
  const [draftForm] = Form.useForm<WxDraftFormValues>();
  const queryClient = useQueryClient();
  const appSettingsQuery = useAppSettingsQuery();
  const [activeSession, setActiveSession] = useState<ProductListingCollectionSession | null>(null);
  const [previewListing, setPreviewListing] = useState<CollectedProductListing | null>(null);
  const [draftModalListing, setDraftModalListing] = useState<CollectedProductListing | null>(null);
  const [draftAiAttrs, setDraftAiAttrs] = useState<WxProductDraftAttribute[]>([]);
  const [draftPrepared, setDraftPrepared] = useState<WxProductDraftPrepareResult | null>(null);
  const [draftSuggestion, setDraftSuggestion] = useState<WxProductDraftSuggestionResult | null>(null);
  const [draftSubmittedResult, setDraftSubmittedResult] = useState<WxProductDraftCreationResult | null>(null);
  const [fullCategoryStatus, setFullCategoryStatus] = useState<string>('');

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

  const prepareDraftMutation = useMutation({
    mutationFn: async () => {
      if (!draftModalListing) throw new Error('请选择要准备的采集商品');
      const values = await draftForm.validateFields();
      const catIds = parseCatIds(values.catIdsText);
      if (!isValidCategoryPathIds(catIds)) {
        throw new Error('请先运行 AI 测试生成微信小店类目路径，或手动填写 3 到 4 个类目 ID');
      }
      return extensionApi.productListingCollection.prepareWxDraft({
        accountId: values.accountId,
        listingId: draftModalListing.id,
        catIds,
        expressTemplateId: values.expressTemplateId?.trim() || undefined,
        brandId: values.brandId?.trim() || undefined,
        defaultStockNum: values.defaultStockNum,
        autoListing: Boolean(values.autoListing),
        attrs: draftAiAttrs.length > 0 ? draftAiAttrs : undefined,
      });
    },
    onSuccess: prepared => {
      setDraftPrepared(prepared);
      setDraftSubmittedResult(null);
      message.success('商品准备完成，可以提交草稿');
    },
    onError: error => {
      const detail = error instanceof Error ? error.message : '商品准备失败';
      message.error(detail);
    },
  });

  const submitPreparedDraftMutation = useMutation({
    mutationFn: () => {
      if (!draftPrepared) throw new Error('请先完成商品准备');
      return extensionApi.productListingCollection.submitPreparedWxDraft({
        accountId: draftPrepared.accountId,
        listingId: draftPrepared.listingId,
        request: draftPrepared.request,
        uploadedImageCount: draftPrepared.uploadedImageCount,
        autoListing: draftPrepared.request.listing === 1,
      });
    },
    onSuccess: result => {
      setDraftSubmittedResult(result);
      message.success(`微信小店草稿已创建：${result.productId}`);
    },
    onError: error => {
      const detail = error instanceof Error ? error.message : '提交微信小店草稿失败';
      message.error(detail);
    },
  });

  const suggestDraftMutation = useMutation({
    mutationFn: async () => {
      if (!draftModalListing) throw new Error('请选择要处理的采集商品');
      const values = await draftForm.validateFields(['accountId', 'catIdsText']);
      const manualCatIds = parseCatIds(values.catIdsText);
      return extensionApi.productListingCollection.suggestWxDraft({
        accountId: values.accountId,
        listingId: draftModalListing.id,
        wxCatIds: manualCatIds.length > 0 ? manualCatIds : undefined,
      });
    },
    onSuccess: suggestion => {
      setDraftSuggestion(suggestion);
      setDraftAiAttrs(suggestion.attrs);
      setDraftPrepared(null);
      setDraftSubmittedResult(null);
      draftForm.setFieldsValue({
        catIdsText: suggestion.catIds.join(','),
        expressTemplateId: suggestion.expressTemplateId || draftForm.getFieldValue('expressTemplateId'),
      });
      message.success('AI 已选择微信类目并整理上架属性');
    },
    onError: error => {
      const detail = error instanceof Error ? error.message : 'AI 处理失败';
      message.error(detail);
    },
  });

  const suggestFullCategoryMutation = useMutation({
    onMutate: () => {
      setFullCategoryStatus('正在读取静态微信类目并调用 LLM，最多等待 90 秒。');
    },
    mutationFn: async () => {
      if (!draftModalListing) throw new Error('请选择要处理的采集商品');
      const values = await draftForm.validateFields(['accountId']);
      return extensionApi.productListingCollection.suggestWxCategoryFromFullList({
        accountId: values.accountId,
        listingId: draftModalListing.id,
      });
    },
    onSuccess: suggestion => {
      setDraftSuggestion(suggestion);
      setDraftAiAttrs(suggestion.attrs);
      setDraftPrepared(null);
      setDraftSubmittedResult(null);
      draftForm.setFieldsValue({
        catIdsText: suggestion.catIds.join(','),
        expressTemplateId: suggestion.expressTemplateId || draftForm.getFieldValue('expressTemplateId'),
      });
      setFullCategoryStatus(`已完成：${suggestion.categoryPath?.join(' / ') || suggestion.catIds.join(' / ')}`);
      message.success('AI 已从静态全量类目中选择微信类目');
    },
    onError: error => {
      const detail = error instanceof Error ? error.message : 'AI 全量类目处理失败';
      setFullCategoryStatus(`失败：${detail}`);
      message.error(detail);
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

  const openDraftModal = useCallback((listing: CollectedProductListing) => {
    const defaultAccountId = activeAccountId || accounts[0]?.id || '';
    const defaultExpressTemplateId = appSettingsQuery.data?.aiListing.defaultExpressTemplateId || '';
    setDraftModalListing(listing);
    setDraftAiAttrs([]);
    setDraftPrepared(null);
    setDraftSuggestion(null);
    setDraftSubmittedResult(null);
    setFullCategoryStatus('');
    draftForm.setFieldsValue({
      accountId: defaultAccountId,
      catIdsText: '',
      expressTemplateId: defaultExpressTemplateId,
      brandId: '2100000000',
      defaultStockNum: 100,
      autoListing: false,
    });
  }, [accounts, activeAccountId, appSettingsQuery.data?.aiListing.defaultExpressTemplateId, draftForm]);

  const closeDraftModal = () => {
    setDraftModalListing(null);
    setDraftAiAttrs([]);
    setDraftPrepared(null);
    setDraftSuggestion(null);
    setDraftSubmittedResult(null);
    setFullCategoryStatus('');
    draftForm.resetFields();
  };

  const resetPreparedDraft = () => {
    setDraftPrepared(null);
    setDraftSubmittedResult(null);
  };

  const draftStepItems: React.ComponentProps<typeof Steps>['items'] = [
    {
      title: '采集商品',
      description: draftModalListing ? '已完成' : '等待采集',
      status: draftModalListing ? 'finish' : 'wait',
    },
    {
      title: 'AI 测试',
      description: draftSuggestion ? '已生成建议' : '可选',
      status: suggestDraftMutation.isPending || suggestFullCategoryMutation.isPending ? 'process' : draftSuggestion ? 'finish' : 'wait',
    },
    {
      title: '商品准备',
      description: draftPrepared ? '请求体已生成' : '待准备',
      status: prepareDraftMutation.isPending ? 'process' : draftPrepared ? 'finish' : 'wait',
    },
    {
      title: '提交草稿',
      description: draftSubmittedResult ? draftSubmittedResult.productId : '待提交',
      status: submitPreparedDraftMutation.isPending ? 'process' : draftSubmittedResult ? 'finish' : 'wait',
    },
  ];

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
      title: '图片',
      key: 'images',
      width: 120,
      render: (_: unknown, record) => (
        <div>
          <div>主图 {record.mainImages.length}</div>
          <div style={{ color: '#6b7280', fontSize: 12 }}>详情 {record.detailImages.length}</div>
        </div>
      ),
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
      width: 240,
      render: (_: unknown, record) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setPreviewListing(record)}>
            查看
          </Button>
          <Button
            type="link"
            size="small"
            icon={<CloudUploadOutlined />}
            disabled={accounts.length === 0}
            onClick={() => openDraftModal(record)}
          >
            分步上架
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
  ], [accounts.length, openDraftModal, removeMutation]);

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
                {
                  label: '原类目',
                  children: sourceCategoryText(previewListing),
                },
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
              <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>
                图文详情
                <span style={{ marginLeft: 8, color: '#6b7280', fontSize: 12, fontWeight: 400 }}>
                  {previewListing.detailImages.length} 张
                </span>
              </h3>
              {previewListing.detailImages.length > 0 ? (
                <Image.PreviewGroup>
                  <div style={detailImageGridStyle}>
                    {previewListing.detailImages.map((url, index) => (
                      <Image
                        key={`${url}:${index}`}
                        src={url}
                        width="100%"
                        height={128}
                        alt="商品详情图"
                        styles={{ root: { objectFit: 'cover', background: '#f6f8fa' } }}
                      />
                    ))}
                  </div>
                </Image.PreviewGroup>
              ) : (
                <div style={{ color: '#9ca3af', fontSize: 13, padding: '12px 0' }}>
                  暂无详情图
                </div>
              )}
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
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>采集原始数据</h3>
              <Input.TextArea
                readOnly
                value={JSON.stringify(previewListing, null, 2)}
                autoSize={{ minRows: 10, maxRows: 24 }}
              />
            </div>
          </Space>
        )}
      </Drawer>

      <Modal
        title="分步上架到微信小店草稿"
        open={Boolean(draftModalListing)}
        destroyOnHidden
        width={760}
        footer={[
          <Button key="close" onClick={closeDraftModal}>
            关闭
          </Button>,
          <Button
            key="ai"
            icon={<RobotOutlined />}
            loading={suggestDraftMutation.isPending}
            disabled={suggestFullCategoryMutation.isPending}
            onClick={() => suggestDraftMutation.mutate()}
          >
            AI 测试
          </Button>,
          <Button
            key="ai-full"
            icon={<RobotOutlined />}
            loading={suggestFullCategoryMutation.isPending}
            disabled={suggestDraftMutation.isPending}
            onClick={() => suggestFullCategoryMutation.mutate()}
          >
            AI 全量类目
          </Button>,
          <Button
            key="prepare"
            loading={prepareDraftMutation.isPending}
            onClick={() => prepareDraftMutation.mutate()}
          >
            商品准备
          </Button>,
          <Button
            key="submit"
            type="primary"
            disabled={!draftPrepared || Boolean(draftSubmittedResult)}
            loading={submitPreparedDraftMutation.isPending}
            onClick={() => submitPreparedDraftMutation.mutate()}
          >
            提交草稿
          </Button>,
        ]}
        onCancel={closeDraftModal}
      >
        <Steps
          size="small"
          current={draftSubmittedResult ? 3 : draftPrepared ? 2 : draftSuggestion ? 1 : 0}
          items={draftStepItems}
          style={{ marginBottom: 20 }}
        />
        <Form
          form={draftForm}
          layout="vertical"
          preserve={false}
          onValuesChange={resetPreparedDraft}
        >
          <Form.Item
            name="accountId"
            label="微信小店账号"
            rules={[{ required: true, message: '请选择微信小店账号' }]}
          >
            <Select
              placeholder="选择账号"
              options={accounts.map(account => ({ label: account.name, value: account.id }))}
            />
          </Form.Item>
          <Descriptions
            size="small"
            column={1}
            style={{ marginBottom: 16 }}
            items={[
              {
                label: '原商品类目',
                children: sourceCategoryText(draftModalListing) === '-'
                  ? '采集结果未识别到类目名称'
                  : sourceCategoryText(draftModalListing),
              },
            ]}
          />
          {fullCategoryStatus && (
            <Alert
              type={suggestFullCategoryMutation.isError ? 'error' : suggestFullCategoryMutation.isSuccess ? 'success' : 'info'}
              showIcon
              style={{ marginBottom: 16 }}
              title="AI 全量类目状态"
              description={fullCategoryStatus}
            />
          )}
          <Form.Item
            name="catIdsText"
            label="微信小店类目路径 ID（AI 回填）"
            extra="AI 测试保留旧 lookup 逻辑；AI 全量类目会读取静态微信叶子类目缓存，让模型直接从全部候选中选择。手动兜底时按完整路径填写 3 到 4 个 ID。"
            rules={[
              {
                validator: async (_, value: string) => {
                  const catIds = parseCatIds(value);
                  if (catIds.length === 0 || isValidCategoryPathIds(catIds)) return;
                  throw new Error('手动指定时需要填写 3 到 4 个类目 ID');
                },
              },
            ]}
          >
            <Input placeholder="AI 自动回填，或手动输入 10000111,10000113,6091" />
          </Form.Item>
          {draftSuggestion && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              title={draftSuggestion.reason}
              description={(
                <Space vertical size={8} style={{ width: '100%' }}>
                  <Tag color={draftSuggestion.confidence >= 0.7 ? 'green' : 'orange'}>
                    置信度 {Math.round(draftSuggestion.confidence * 100)}%
                  </Tag>
                  <Space size={4} wrap>
                    <Tag color="blue">类目 ID {draftSuggestion.catIds.join(' / ')}</Tag>
                    {draftSuggestion.categoryPath && (
                      <Tag color="cyan">类目 {draftSuggestion.categoryPath.join(' / ')}</Tag>
                    )}
                    <Tag color={draftSuggestion.categoryCandidateSource === 'taobaoWxLookup' ? 'green' : draftSuggestion.categoryCandidateSource === 'wxStaticSnapshot' ? 'purple' : 'default'}>
                      来源 {categoryCandidateSourceText(draftSuggestion.categoryCandidateSource)}
                    </Tag>
                  </Space>
                  {draftSuggestion.categoryLookup && (
                    <Space size={4} wrap>
                      <Tag>淘宝匹配 {draftSuggestion.categoryLookup.matchedTaobaoPath || draftSuggestion.categoryLookup.taobaoPath || '-'}</Tag>
                      <Tag>{categoryCandidateScopeText(draftSuggestion.categoryLookup.candidateScope)}</Tag>
                      <Tag>
                        层级 {draftSuggestion.categoryLookup.matchDepth ?? 0}
                        /{draftSuggestion.categoryLookup.sourceDepth ?? 0}
                      </Tag>
                      <Tag>候选 {draftSuggestion.categoryLookup.candidateCount}</Tag>
                    </Space>
                  )}
                  {draftSuggestion.categoryCandidates && draftSuggestion.categoryCandidates.length > 0 && (
                    <Space size={4} wrap>
                      {draftSuggestion.categoryCandidates.map(candidate => (
                        <Tag key={candidate.catIds.join('/')}>
                          {candidate.names.join(' / ')}
                          {typeof candidate.confidence === 'number' ? ` ${Math.round(candidate.confidence * 100)}%` : ''}
                        </Tag>
                      ))}
                    </Space>
                  )}
                  <Space size={4} wrap>
                    {draftAiAttrs.length > 0
                      ? draftAiAttrs.map(attr => (
                        <Tag key={`${attr.attrKey}:${attr.attrValue}`}>
                          {attr.attrKey}: {attr.attrValue}
                        </Tag>
                      ))
                      : <Tag>沿用采集参数</Tag>}
                  </Space>
                  {draftSuggestion.warnings.length > 0 && (
                    <Space size={4} wrap>
                      {draftSuggestion.warnings.map(warning => (
                        <Tag key={warning} color="orange">{warning}</Tag>
                      ))}
                    </Space>
                  )}
                </Space>
              )}
            />
          )}
          {draftPrepared && (
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
              title="商品准备完成"
              description={(
                <Space size={4} wrap>
                  <Tag>主图 {draftPrepared.summary.headImageCount}</Tag>
                  <Tag>详情图 {draftPrepared.summary.detailImageCount}</Tag>
                  <Tag>SKU {draftPrepared.summary.skuCount}</Tag>
                  <Tag>属性 {draftPrepared.summary.attrCount}</Tag>
                  <Tag>已上传图片 {draftPrepared.uploadedImageCount}</Tag>
                  <Tag color={draftPrepared.summary.listing ? 'blue' : 'default'}>
                    {draftPrepared.summary.listing ? '创建后提审' : '草稿箱'}
                  </Tag>
                </Space>
              )}
            />
          )}
          {draftSubmittedResult && (
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
              title="微信小店草稿提交完成"
              description={`商品 ID：${draftSubmittedResult.productId}`}
            />
          )}
          <Form.Item
            name="expressTemplateId"
            label="运费模板 ID"
            extra="不填写时不传 express_info，由微信小店接口按店铺规则处理。"
          >
            <Input allowClear placeholder="47428464001" />
          </Form.Item>
          <Form.Item
            name="brandId"
            label="品牌 ID"
            extra="默认 2100000000 表示无品牌。"
          >
            <Input allowClear placeholder="2100000000" />
          </Form.Item>
          <Form.Item
            name="defaultStockNum"
            label="默认库存"
            rules={[{ required: true, message: '请输入默认库存' }]}
          >
            <InputNumber min={0} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="autoListing"
            label="创建后提交审核"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProductListingPage;
