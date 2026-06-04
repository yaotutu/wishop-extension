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
import { queryKeys } from '../../query/query-keys';
import { extensionApi } from '../../shared/extension-api';
import type {
  Account,
  CollectedProductListing,
  ProductListingCollectionSession,
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
  return listing.sku.groups.map(group => `${group.name} ${group.values.length}`).join(' / ') || '-';
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

function sourceCategoryText(listing?: Pick<CollectedProductListing, 'category'> | null): string {
  const category = listing?.category.source;
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
  brandId?: string;
  autoListing?: boolean;
}

function isValidCategoryPathIds(catIds: string[]): boolean {
  return catIds.length >= 3 && catIds.length <= 4;
}

function categoryCandidateSourceText(source?: WxProductDraftSuggestionResult['categoryCandidateSource']): string {
  if (source === 'wxStaticSnapshot') return '静态全量类目';
  return '未记录来源';
}

const ProductListingPage: React.FC<ProductListingPageProps> = ({ accounts, activeAccountId }) => {
  const [form] = Form.useForm<{ url: string }>();
  const [draftForm] = Form.useForm<WxDraftFormValues>();
  const queryClient = useQueryClient();
  const [activeSession, setActiveSession] = useState<ProductListingCollectionSession | null>(null);
  const [previewListing, setPreviewListing] = useState<CollectedProductListing | null>(null);
  const [draftModalListing, setDraftModalListing] = useState<CollectedProductListing | null>(null);
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

  /**
   * 上货主流程只保留这一条生成入口：
   * 1. 每次都让 AI 从静态全量微信叶子类目里选择类目，避免手填类目和 AI 路径混用；
   * 2. 后台读取本地类目发品规则，让 AI 按必填规则补齐商品参数并做本地校验；
   * 3. 准备阶段会上传商品图片到微信小店，但不会创建草稿商品，真正创建仍由“提交草稿”单独触发。
   */
  const generateDraftDataMutation = useMutation({
    onMutate: () => {
      setFullCategoryStatus('正在选择微信类目并生成上架数据，图片会同步上传到微信小店。');
    },
    mutationFn: async () => {
      if (!draftModalListing) throw new Error('请选择要处理的采集商品');
      const values = await draftForm.validateFields();
      const suggestion = await extensionApi.productListingCollection.suggestWxCategoryFromFullList({
        accountId: values.accountId,
        listingId: draftModalListing.id,
      });
      const catIds = suggestion.catIds;

      if (!isValidCategoryPathIds(catIds)) {
        throw new Error('AI 返回的微信小店类目路径不完整，请重新生成');
      }
      const prepared = await extensionApi.productListingCollection.prepareWxDraft({
        accountId: values.accountId,
        listingId: draftModalListing.id,
        catIds,
        brandId: values.brandId?.trim() || undefined,
        autoListing: Boolean(values.autoListing),
      });
      return { suggestion, prepared, catIds };
    },
    onSuccess: ({ suggestion, prepared, catIds }) => {
      setDraftSuggestion(suggestion);
      draftForm.setFieldsValue({
        catIdsText: suggestion.catIds.join(','),
      });
      setDraftPrepared(prepared);
      setDraftSubmittedResult(null);
      const categoryText = suggestion?.categoryPath?.join(' / ') || catIds.join(' / ');
      setFullCategoryStatus(prepared.warnings.length > 0
        ? `已生成：${categoryText}，${prepared.warnings.length} 条商品参数复核提示。`
        : `已生成：${categoryText}`);
      message.success('上架数据已生成，可以提交草稿');
    },
    onError: error => {
      const detail = error instanceof Error ? error.message : '上架数据生成失败';
      setFullCategoryStatus(`失败：${detail}`);
      message.error(detail);
    },
  });

  const submitPreparedDraftMutation = useMutation({
    mutationFn: () => {
      if (!draftPrepared) throw new Error('请先生成上架数据');
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
    setDraftModalListing(listing);
    setDraftPrepared(null);
    setDraftSuggestion(null);
    setDraftSubmittedResult(null);
    setFullCategoryStatus('');
    draftForm.setFieldsValue({
      accountId: defaultAccountId,
      catIdsText: '',
      brandId: '2100000000',
      autoListing: false,
    });
  }, [accounts, activeAccountId, draftForm]);

  const closeDraftModal = () => {
    setDraftModalListing(null);
    setDraftPrepared(null);
    setDraftSuggestion(null);
    setDraftSubmittedResult(null);
    setFullCategoryStatus('');
    draftForm.resetFields();
  };

  const resetPreparedDraft = (changedValues?: Partial<WxDraftFormValues>) => {
    setDraftPrepared(null);
    setDraftSubmittedResult(null);
    setFullCategoryStatus('');
  };

  const draftStepItems: React.ComponentProps<typeof Steps>['items'] = [
    {
      title: '采集商品',
      description: draftModalListing ? '已完成' : '等待采集',
      status: draftModalListing ? 'finish' : 'wait',
    },
    {
      title: '生成上架数据',
      description: draftPrepared ? '请求体已生成' : '待生成',
      status: generateDraftDataMutation.isPending ? 'process' : draftPrepared ? 'finish' : 'wait',
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
            src={record.images.main[0]}
            width={48}
            height={48}
            alt={record.title}
            preview={false}
            styles={{ root: { objectFit: 'cover', borderRadius: 4, background: '#f6f8fa' } }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>
              {record.title || record.identity.itemId}
            </div>
            <div style={{ color: '#6b7280', fontSize: 12 }}>
              {record.shop.name || '-'} · {record.identity.itemId}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: '价格',
      key: 'priceRangeText',
      width: 110,
      render: (_: unknown, record) => record.price.rangeText || '-',
    },
    {
      title: '图片',
      key: 'images',
      width: 120,
      render: (_: unknown, record) => (
        <div>
          <div>主图 {record.images.main.length}</div>
          <div style={{ color: '#6b7280', fontSize: 12 }}>详情 {record.images.detail.length}</div>
        </div>
      ),
    },
    {
      title: 'SKU',
      key: 'sku',
      width: 180,
      render: (_: unknown, record) => (
        <div>
          <div>{record.sku.matrix.length} 个 SKU</div>
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
                { label: '商品 ID', children: previewListing.identity.itemId },
                { label: '平台', children: previewListing.identity.platform },
                { label: '店铺', children: previewListing.shop.name || '-' },
                {
                  label: '原类目',
                  children: sourceCategoryText(previewListing),
                },
                { label: '价格', children: previewListing.price.rangeText || '-' },
                { label: '销量', children: previewListing.sales.text || '-' },
                { label: '发货', children: previewListing.delivery.text || '-' },
                { label: '详情来源', children: previewListing.detail.source },
                { label: '图片资产', children: `${previewListing.images.assets.length} 个` },
              ]}
            />
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>主图</h3>
              <Image.PreviewGroup>
                <div style={imageGridStyle}>
                  {previewListing.images.main.map(url => (
                    <Image key={url} src={url} width="100%" height={72} alt="商品主图" styles={{ root: { objectFit: 'cover' } }} />
                  ))}
                </div>
              </Image.PreviewGroup>
            </div>
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>
                图文详情
                <span style={{ marginLeft: 8, color: '#6b7280', fontSize: 12, fontWeight: 400 }}>
                  {previewListing.images.detail.length} 张
                </span>
              </h3>
              {previewListing.images.detail.length > 0 ? (
                <Image.PreviewGroup>
                  <div style={detailImageGridStyle}>
                    {previewListing.images.detail.map((url, index) => (
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
                dataSource={previewListing.params}
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
                dataSource={previewListing.sku.matrix}
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
            key="generate"
            icon={<RobotOutlined />}
            loading={generateDraftDataMutation.isPending}
            disabled={submitPreparedDraftMutation.isPending}
            onClick={() => generateDraftDataMutation.mutate()}
          >
            生成上架数据
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
          current={draftSubmittedResult ? 2 : draftPrepared ? 1 : 0}
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
              type={generateDraftDataMutation.isError ? 'error' : generateDraftDataMutation.isSuccess ? 'success' : 'info'}
              showIcon
              style={{ marginBottom: 16 }}
              title="上架数据生成状态"
              description={fullCategoryStatus}
            />
          )}
          <Form.Item
            name="catIdsText"
            label="微信小店类目路径 ID（AI 生成）"
            extra="每次生成上架数据都会从静态微信叶子类目全量缓存中重新选择类目。"
          >
            <Input disabled placeholder="生成后展示类目路径 ID" />
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
                    <Tag color="purple">
                      来源 {categoryCandidateSourceText(draftSuggestion.categoryCandidateSource)}
                    </Tag>
                  </Space>
                  {draftSuggestion.categoryLookup && (
                    <Space size={4} wrap>
                      <Tag>候选 {draftSuggestion.categoryLookup.candidateCount}</Tag>
                      <Tag>范围 静态全量类目</Tag>
                    </Space>
                  )}
                  {draftSuggestion.categoryCandidates && draftSuggestion.categoryCandidates.length > 0 && (
                    <Space size={4} wrap>
                      {draftSuggestion.categoryCandidates.map(candidate => (
                        <Tag key={candidate.catIds.join('/')}>
                          {candidate.names.join(' / ')}
                        </Tag>
                      ))}
                    </Space>
                  )}
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
              title="上架数据已生成"
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
                  {draftPrepared.warnings.length > 0 && (
                    <Tag color="orange">参数复核 {draftPrepared.warnings.length}</Tag>
                  )}
                </Space>
              )}
            />
          )}
          {draftPrepared?.warnings.length ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              title="商品参数已按微信类目规则补齐"
              description={(
                <Space size={4} wrap>
                  {draftPrepared.warnings.map(warning => (
                    <Tag key={warning} color="orange">{warning}</Tag>
                  ))}
                </Space>
              )}
            />
          ) : null}
          {draftSubmittedResult && (
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
              title="微信小店草稿提交完成"
              description={`商品 ID：${draftSubmittedResult.productId}`}
            />
          )}
          <Form.Item name="brandId" label="品牌 ID" extra="默认 2100000000 表示无品牌。">
            <Input allowClear placeholder="2100000000" />
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
