import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircleOutlined, ImportOutlined, ReloadOutlined, RobotOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  Descriptions,
  Form,
  Image,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Steps,
  Table,
  Tabs,
  Tag,
} from 'antd';
import type { TableProps } from 'antd';
import { queryKeys } from '../../query/query-keys';
import { extensionApi } from '../../shared/extension-api';
import {
  buildProductCopyImageUploadPlan,
  type ProductCopyImageUploadPlanSource,
} from '../../shared/product-copy-image-upload-plan';
import type {
  ProductCopyCategoryOption,
  ProductCopyDefaultSettings,
  ProductCopyDefaultSettingsPatch,
  ProductCopyPriceRounding,
  ProductCopyRecord,
  DeleteCreatedWxDraftBoxProductResult,
  ProductCopySession,
  WxDraftBoxProductPrepareResult,
  WxProductDraftCreationResult,
  WxProductDraftSuggestionResult,
} from '../../shared/types';

type ProductCopyWizardStep = 'input' | 'collectionPreview' | 'parameterSettings' | 'draftPreview' | 'completed';

interface ProductCopyPageProps {
  accountId: string;
  accountName?: string;
}

const DEFAULT_BRAND_ID = '2100000000';
const DEFAULT_DRAFT_STOCK_NUM = 999;
const DRAFT_BOX_LISTING_VALUE = 0;

interface ProductCopyParameterFormValues {
  autoCategoryMatch: boolean;
  categoryKey?: string;
  duplicateFilter: boolean;
  productStatus: 'draftBox';
  expressTemplateId?: string;
  afterSaleAddressId?: string;
  brandId?: string;
  defaultStockNum?: number;
  autoSourceBinding: boolean;
  priceMultiplier?: number;
  priceAddAmountYuan?: number;
  priceRounding: ProductCopyPriceRounding;
  titlePrefix?: string;
  titleSuffix?: string;
  mainImageSkipFirst?: number;
  mainImageSkipLast?: number;
  detailImageSkipFirst?: number;
  detailImageSkipLast?: number;
  maxDetailImages?: number;
  unifiedStockNum?: number;
  zeroStockReplacement?: number;
  minSkuPriceYuan?: number;
}

type ParameterSummaryStatus = 'default' | 'configured' | 'localDefault';

type AdvancedSettingsConfiguredCounts = {
  basic: number;
  pricingContent: number;
  sku: number;
};

const missingFieldLabels: Record<string, string> = {
  title: '标题',
  mainImages: '主图',
  detailImages: '详情图',
  skuMatrix: 'SKU',
  productParams: '商品参数',
};

const wizardStepIndex: Record<ProductCopyWizardStep, number> = {
  input: 0,
  collectionPreview: 1,
  parameterSettings: 2,
  draftPreview: 3,
  completed: 4,
};

const pageStyle: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minHeight: 0,
};

const scrollBodyStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
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

const previewImageTileStyle: React.CSSProperties = {
  width: '100%',
  overflow: 'hidden',
  background: '#f6f8fa',
  borderRadius: 4,
};

const actionBarStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  paddingTop: 12,
  borderTop: '1px solid #f0f0f0',
};

const compactParameterGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '8px 16px',
  alignItems: 'center',
  marginBottom: 12,
};

const compactParameterItemStyle: React.CSSProperties = {
  marginBottom: 0,
};

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN');
}

function formatCentPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return `¥${(value / 100).toFixed(2)}`;
}

function skuSummary(listing: ProductCopyRecord): string {
  return listing.sku.groups.map(group => `${group.name} ${group.values.length}`).join(' / ') || '-';
}

function statusTags(listing: ProductCopyRecord): React.ReactNode {
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

function sourceCategoryText(listing?: Pick<ProductCopyRecord, 'category'> | null): string {
  const category = listing?.category.source;
  if (!category) return '-';
  return category.path?.join(' / ')
    || category.name
    || (category.id ? `类目ID ${category.id}` : '-');
}

function isValidCategoryPathIds(catIds: string[]): boolean {
  return catIds.length >= 3 && catIds.length <= 4;
}

function categoryCandidateSourceText(source?: WxProductDraftSuggestionResult['categoryCandidateSource']): string {
  if (source === 'wxStaticSnapshot') return '静态全量类目';
  return '未记录来源';
}

function normalizedCategoryText(suggestion: WxProductDraftSuggestionResult | null): string {
  if (!suggestion) return '-';
  return suggestion.categoryPath?.join(' / ') || suggestion.catIds.join(' / ') || '-';
}

function fenToYuan(value?: number): number | undefined {
  return value === undefined ? undefined : Number((value / 100).toFixed(2));
}

function yuanToFen(value?: number): number | undefined {
  if (value === undefined || value === null || !Number.isFinite(Number(value))) return undefined;
  return Math.round(Number(value) * 100);
}

function optionalInteger(value?: number): number | undefined {
  if (value === undefined || value === null || !Number.isFinite(Number(value))) return undefined;
  return Math.max(0, Math.floor(Number(value)));
}

function defaultParameterValues(settings?: ProductCopyDefaultSettings | null): ProductCopyParameterFormValues {
  return {
    autoCategoryMatch: true,
    duplicateFilter: true,
    productStatus: 'draftBox',
    brandId: settings?.brandId || DEFAULT_BRAND_ID,
    expressTemplateId: settings?.expressTemplateId,
    afterSaleAddressId: settings?.afterSaleAddressId,
    defaultStockNum: settings?.sku.defaultStockNum ?? DEFAULT_DRAFT_STOCK_NUM,
    autoSourceBinding: settings?.autoSourceBinding ?? true,
    priceMultiplier: settings?.pricing.multiplier ?? 1,
    priceAddAmountYuan: fenToYuan(settings?.pricing.addAmountFen) ?? 0,
    priceRounding: settings?.pricing.rounding ?? 'cent',
    titlePrefix: settings?.content.titlePrefix || '',
    titleSuffix: settings?.content.titleSuffix || '',
    mainImageSkipFirst: settings?.content.mainImageSkipFirst ?? 0,
    mainImageSkipLast: settings?.content.mainImageSkipLast ?? 0,
    detailImageSkipFirst: settings?.content.detailImageSkipFirst ?? 0,
    detailImageSkipLast: settings?.content.detailImageSkipLast ?? 0,
    maxDetailImages: settings?.content.maxDetailImages,
    unifiedStockNum: settings?.sku.unifiedStockNum,
    zeroStockReplacement: settings?.sku.zeroStockReplacement,
    minSkuPriceYuan: fenToYuan(settings?.sku.minSkuPriceFen),
  };
}

function buildDefaultSettingsPatch(values: ProductCopyParameterFormValues): ProductCopyDefaultSettingsPatch {
  return {
    expressTemplateId: values.expressTemplateId,
    afterSaleAddressId: values.afterSaleAddressId,
    brandId: values.brandId?.trim() || DEFAULT_BRAND_ID,
    autoSourceBinding: values.autoSourceBinding !== false,
    pricing: {
      multiplier: values.priceMultiplier && values.priceMultiplier > 0 ? values.priceMultiplier : 1,
      addAmountFen: yuanToFen(values.priceAddAmountYuan) ?? 0,
      rounding: values.priceRounding || 'cent',
    },
    content: {
      titlePrefix: values.titlePrefix?.trim() || '',
      titleSuffix: values.titleSuffix?.trim() || '',
      mainImageSkipFirst: optionalInteger(values.mainImageSkipFirst) ?? 0,
      mainImageSkipLast: optionalInteger(values.mainImageSkipLast) ?? 0,
      detailImageSkipFirst: optionalInteger(values.detailImageSkipFirst) ?? 0,
      detailImageSkipLast: optionalInteger(values.detailImageSkipLast) ?? 0,
      maxDetailImages: optionalInteger(values.maxDetailImages),
    },
    sku: {
      defaultStockNum: optionalInteger(values.defaultStockNum) ?? DEFAULT_DRAFT_STOCK_NUM,
      unifiedStockNum: optionalInteger(values.unifiedStockNum),
      zeroStockReplacement: optionalInteger(values.zeroStockReplacement),
      minSkuPriceFen: yuanToFen(values.minSkuPriceYuan),
    },
  };
}

function buildDefaultFreightTemplatePatch(
  settings: ProductCopyDefaultSettings | null | undefined,
  expressTemplateId: string,
): ProductCopyDefaultSettingsPatch {
  return {
    ...buildDefaultSettingsPatch(defaultParameterValues(settings)),
    expressTemplateId,
  };
}

function formatOptionalYuan(value?: number): string {
  return value === undefined || value === null || !Number.isFinite(Number(value))
    ? ''
    : Number(value).toFixed(2).replace(/\.00$/, '');
}

function isPositiveConfigured(value?: number): boolean {
  return value !== undefined && value !== null && Number.isFinite(Number(value)) && Number(value) > 0;
}

function renderParameterSummaryValue(value: string, status: ParameterSummaryStatus): React.ReactNode {
  const tag = status === 'configured'
    ? { color: 'blue', text: '已配置' }
    : status === 'localDefault'
      ? { color: 'cyan', text: '本地默认' }
      : { color: 'default', text: '默认' };
  return (
    <Space size={6} wrap>
      <span>{value}</span>
      <Tag color={tag.color}>{tag.text}</Tag>
    </Space>
  );
}

function priceRoundingText(rounding: ProductCopyPriceRounding): string {
  if (rounding === 'jiao') return '抹到角';
  if (rounding === 'yuan') return '抹到元';
  return '保留分';
}

function priceRuleText(values: ProductCopyParameterFormValues): string {
  const multiplier = values.priceMultiplier && values.priceMultiplier > 0 ? values.priceMultiplier : 1;
  const addAmount = values.priceAddAmountYuan || 0;
  return `源价 x ${multiplier} + ${formatOptionalYuan(addAmount) || '0'} 元，${priceRoundingText(values.priceRounding || 'cent')}`;
}

function hasConfiguredPriceRule(values: ProductCopyParameterFormValues): boolean {
  return (values.priceMultiplier ?? 1) !== 1
    || (values.priceAddAmountYuan ?? 0) !== 0
    || (values.priceRounding || 'cent') !== 'cent';
}

function titleRuleText(values: ProductCopyParameterFormValues): string {
  const prefix = values.titlePrefix?.trim();
  const suffix = values.titleSuffix?.trim();
  if (!prefix && !suffix) return '未添加前后缀';
  return [
    prefix ? `前缀：${prefix}` : '',
    suffix ? `后缀：${suffix}` : '',
  ].filter(Boolean).join('，');
}

function imageRuleText(values: ProductCopyParameterFormValues): string {
  const mainSkipFirst = values.mainImageSkipFirst || 0;
  const mainSkipLast = values.mainImageSkipLast || 0;
  const detailSkipFirst = values.detailImageSkipFirst || 0;
  const detailSkipLast = values.detailImageSkipLast || 0;
  const maxDetailImages = values.maxDetailImages;
  const mainText = mainSkipFirst || mainSkipLast
    ? `主图忽略前 ${mainSkipFirst} 张、后 ${mainSkipLast} 张`
    : '主图不处理';
  const detailText = detailSkipFirst || detailSkipLast || maxDetailImages !== undefined
    ? `详情图忽略前 ${detailSkipFirst} 张、后 ${detailSkipLast} 张${maxDetailImages === undefined ? '' : `，最多 ${maxDetailImages} 张`}`
    : '详情图不处理';
  return `${mainText}；${detailText}`;
}

function hasConfiguredImageRule(values: ProductCopyParameterFormValues): boolean {
  return Boolean(
    values.mainImageSkipFirst
    || values.mainImageSkipLast
    || values.detailImageSkipFirst
    || values.detailImageSkipLast
    || values.maxDetailImages !== undefined,
  );
}

function stockRuleText(values: ProductCopyParameterFormValues): string {
  const stockParts = [`默认库存 ${values.defaultStockNum ?? DEFAULT_DRAFT_STOCK_NUM}`];
  if (values.unifiedStockNum !== undefined) stockParts.push(`统一库存 ${values.unifiedStockNum}`);
  if (values.zeroStockReplacement !== undefined) stockParts.push(`0 库存替换为 ${values.zeroStockReplacement}`);
  return stockParts.join('，');
}

function hasConfiguredStockRule(values: ProductCopyParameterFormValues): boolean {
  return (values.defaultStockNum ?? DEFAULT_DRAFT_STOCK_NUM) !== DEFAULT_DRAFT_STOCK_NUM
    || values.unifiedStockNum !== undefined
    || values.zeroStockReplacement !== undefined;
}

function skuRuleText(values: ProductCopyParameterFormValues): string {
  if (!isPositiveConfigured(values.minSkuPriceYuan)) return '不删除低价 SKU';
  return `删除复制后售价 < ${formatOptionalYuan(values.minSkuPriceYuan)} 元的 SKU`;
}

function advancedSettingsConfiguredCounts(values: ProductCopyParameterFormValues): AdvancedSettingsConfiguredCounts {
  return {
    basic: Number(Boolean(values.afterSaleAddressId)) + Number(Boolean(values.brandId && values.brandId !== DEFAULT_BRAND_ID)),
    pricingContent: Number(hasConfiguredPriceRule(values))
      + Number(Boolean(values.titlePrefix?.trim() || values.titleSuffix?.trim()))
      + Number(hasConfiguredImageRule(values)),
    sku: Number((values.defaultStockNum ?? DEFAULT_DRAFT_STOCK_NUM) !== DEFAULT_DRAFT_STOCK_NUM)
      + Number(values.unifiedStockNum !== undefined)
      + Number(values.zeroStockReplacement !== undefined)
      + Number(isPositiveConfigured(values.minSkuPriceYuan)),
  };
}

function advancedSettingsTabLabel(label: string, count: number): React.ReactNode {
  return (
    <Space size={6}>
      <span>{label}</span>
      <Tag color={count > 0 ? 'blue' : 'default'}>{count > 0 ? `已配置 ${count} 项` : '未修改'}</Tag>
    </Space>
  );
}

function buildParameterSummaryItems(
  values: ProductCopyParameterFormValues,
  categoryByKey: Map<string, ProductCopyCategoryOption>,
  freightTemplates: Array<{ templateId: string; label: string }>,
  defaultExpressTemplateId?: string,
): React.ComponentProps<typeof Descriptions>['items'] {
  const selectedFreightTemplate = values.expressTemplateId
    ? freightTemplates.find(template => template.templateId === values.expressTemplateId)
    : undefined;
  const freightTemplateText = selectedFreightTemplate?.label
    || (values.expressTemplateId ? `模板 ID：${values.expressTemplateId}` : '未选择');
  const manualCategory = values.categoryKey ? categoryByKey.get(values.categoryKey) : undefined;
  const categoryText = values.autoCategoryMatch === false
    ? manualCategory?.path || '手动选择类目'
    : 'AI 自动识别';

  return [
    {
      key: 'category',
      label: '类目',
      children: renderParameterSummaryValue(categoryText, values.autoCategoryMatch === false ? 'configured' : 'default'),
    },
    {
      key: 'freightTemplate',
      label: '运费模板',
      children: renderParameterSummaryValue(
        freightTemplateText,
        values.expressTemplateId
          ? (values.expressTemplateId === defaultExpressTemplateId ? 'localDefault' : 'configured')
          : 'default',
      ),
    },
    {
      key: 'price',
      label: '价格',
      children: renderParameterSummaryValue(priceRuleText(values), hasConfiguredPriceRule(values) ? 'configured' : 'default'),
    },
    {
      key: 'title',
      label: '标题',
      children: renderParameterSummaryValue(titleRuleText(values), values.titlePrefix?.trim() || values.titleSuffix?.trim() ? 'configured' : 'default'),
    },
    {
      key: 'images',
      label: '图片',
      children: renderParameterSummaryValue(imageRuleText(values), hasConfiguredImageRule(values) ? 'configured' : 'default'),
    },
    {
      key: 'stock',
      label: '库存',
      children: renderParameterSummaryValue(stockRuleText(values), hasConfiguredStockRule(values) ? 'configured' : 'default'),
    },
    {
      key: 'sku',
      label: 'SKU',
      children: renderParameterSummaryValue(skuRuleText(values), isPositiveConfigured(values.minSkuPriceYuan) ? 'configured' : 'default'),
    },
    {
      key: 'duplicateFilter',
      label: '重复过滤',
      children: renderParameterSummaryValue(values.duplicateFilter === false ? '允许重复复制' : '遇到已复制记录自动跳过', values.duplicateFilter === false ? 'configured' : 'default'),
    },
    {
      key: 'productStatus',
      label: '商品状态',
      children: renderParameterSummaryValue('草稿箱', 'default'),
    },
    {
      key: 'sourceBinding',
      label: '货源',
      children: renderParameterSummaryValue(values.autoSourceBinding === false ? '不自动关联淘宝链接' : '创建后自动关联淘宝链接', values.autoSourceBinding === false ? 'configured' : 'default'),
    },
  ];
}

function manualCategorySuggestion(copyId: string, category: ProductCopyCategoryOption): WxProductDraftSuggestionResult {
  return {
    copyId,
    catIds: category.catIds,
    categoryPath: category.names,
    categoryCandidateSource: 'wxStaticSnapshot',
    attrs: [],
    confidence: 1,
    reason: '用户在复制商品参数设置中手动选择微信小店类目。',
    warnings: [],
  };
}

interface ProductCopyPreviewImageProps {
  url: string;
  alt: string;
  detail?: boolean;
  fallbackUrls?: string[];
}

const EMPTY_PREVIEW_FALLBACK_URLS: string[] = [];

const ProductCopyPreviewImage: React.FC<ProductCopyPreviewImageProps> = ({
  url,
  alt,
  detail = false,
  fallbackUrls = EMPTY_PREVIEW_FALLBACK_URLS,
}) => {
  const objectUrlRef = useRef<string | null>(null);
  const fallbackRequestedRef = useRef(false);
  const candidateUrls = useMemo(() => Array.from(new Set([url, ...fallbackUrls].filter(Boolean))), [fallbackUrls, url]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [displaySrc, setDisplaySrc] = useState(url);
  const [failed, setFailed] = useState(false);
  const height = detail ? 128 : 72;

  useEffect(() => {
    setCandidateIndex(0);
    fallbackRequestedRef.current = false;
    setDisplaySrc(candidateUrls[0] || url);
    setFailed(false);
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [candidateUrls, url]);

  const handleImageError = useCallback(async () => {
    const nextCandidate = candidateUrls[candidateIndex + 1];
    if (nextCandidate) {
      setCandidateIndex(candidateIndex + 1);
      setDisplaySrc(nextCandidate);
      setFailed(false);
      return;
    }

    if (fallbackRequestedRef.current) {
      setFailed(true);
      return;
    }
    fallbackRequestedRef.current = true;

    try {
      const currentUrl = candidateUrls[candidateIndex] || url;
      const response = await fetch(currentUrl, { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('响应不是图片');

      const objectUrl = URL.createObjectURL(blob);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = objectUrl;
      setDisplaySrc(objectUrl);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [candidateIndex, candidateUrls, url]);

  if (failed) {
    return <div aria-label={alt} style={{ ...previewImageTileStyle, height }} />;
  }

  return (
    <Image
      src={displaySrc}
      width="100%"
      height={height}
      alt={alt}
      loading="lazy"
      onError={handleImageError}
      style={{ objectFit: 'cover', background: '#f6f8fa', borderRadius: 4 }}
    />
  );
};

function renderImageGroup(urls: string[], alt: string, detail = false): React.ReactNode {
  if (urls.length === 0) {
    return <div style={{ color: '#9ca3af', fontSize: 13, padding: '12px 0' }}>暂无图片</div>;
  }
  return (
    <Image.PreviewGroup>
      <div style={detail ? detailImageGridStyle : imageGridStyle}>
        {urls.map((url, index) => (
          <ProductCopyPreviewImage
            key={`${url}:${index}`}
            url={url}
            alt={alt}
            detail={detail}
          />
        ))}
      </div>
    </Image.PreviewGroup>
  );
}

function uploadImageRoleLabel(role: ProductCopyImageUploadPlanSource['role']): string {
  if (role === 'main') return '主图';
  if (role === 'detail') return '详情图';
  if (role === 'sku') return 'SKU 图';
  if (role === 'fallback') return '页面图';
  return '未知';
}

function shortImageUrl(url: string): string {
  const filename = url.split('/').pop() || url;
  return filename.length > 56 ? `${filename.slice(0, 28)}...${filename.slice(-20)}` : filename;
}

function renderUploadImagePlan(plan: ProductCopyImageUploadPlanSource[]): React.ReactNode {
  const columns: TableProps<ProductCopyImageUploadPlanSource & { key: string; index: number }>['columns'] = [
    { title: '#', dataIndex: 'index', width: 56 },
    {
      title: '用途',
      dataIndex: 'role',
      width: 90,
      render: (role: ProductCopyImageUploadPlanSource['role']) => uploadImageRoleLabel(role),
    },
    {
      title: '预览',
      key: 'preview',
      width: 110,
      render: (_: unknown, record) => (
        <ProductCopyPreviewImage
          url={record.sourceUrl}
          fallbackUrls={record.candidates.filter(candidate => candidate !== record.sourceUrl)}
          alt={`实际上传图片 ${record.index}`}
        />
      ),
    },
    {
      title: '上传源图',
      dataIndex: 'sourceUrl',
      render: (url: string) => (
        <a href={url} target="_blank" rel="noreferrer">{shortImageUrl(url)}</a>
      ),
    },
    {
      title: '候选地址',
      key: 'candidates',
      width: 260,
      render: (_: unknown, record) => (
        <Space size={[4, 4]} wrap>
          <Tag>{record.candidates.length} 个候选</Tag>
          {record.candidates.slice(0, 2).map(candidate => (
            <a key={candidate} href={candidate} target="_blank" rel="noreferrer">{shortImageUrl(candidate)}</a>
          ))}
          {record.candidates.length > 2 && <Tag>+{record.candidates.length - 2}</Tag>}
        </Space>
      ),
    },
  ];

  return (
    <Table
      rowKey="key"
      size="small"
      pagination={{ pageSize: 8, showSizeChanger: false }}
      dataSource={plan.map((source, index) => ({ ...source, key: `${index}:${source.sourceUrl}`, index: index + 1 }))}
      columns={columns}
      scroll={{ x: 860 }}
    />
  );
}

function renderSectionTitle(title: string, extra?: React.ReactNode): React.ReactNode {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{title}</h3>
      {extra}
    </div>
  );
}

function renderCategorySuggestion(suggestion: WxProductDraftSuggestionResult | null): React.ReactNode {
  if (!suggestion) return null;
  return (
    <Alert
      type="info"
      showIcon
      title={suggestion.reason}
      description={(
        <Space vertical size={8} style={{ width: '100%' }}>
          <Space size={4} wrap>
            <Tag color={suggestion.confidence >= 0.7 ? 'green' : 'orange'}>
              置信度 {Math.round(suggestion.confidence * 100)}%
            </Tag>
            <Tag color="blue">类目 ID {suggestion.catIds.join(' / ')}</Tag>
            <Tag color="cyan">类目 {normalizedCategoryText(suggestion)}</Tag>
            <Tag color="purple">来源 {categoryCandidateSourceText(suggestion.categoryCandidateSource)}</Tag>
          </Space>
          {suggestion.categoryLookup && (
            <Space size={4} wrap>
              <Tag>候选 {suggestion.categoryLookup.candidateCount}</Tag>
              <Tag>范围 静态全量类目</Tag>
            </Space>
          )}
          {suggestion.categoryCandidates && suggestion.categoryCandidates.length > 0 && (
            <Space size={4} wrap>
              {suggestion.categoryCandidates.map(candidate => (
                <Tag key={candidate.catIds.join('/')}>
                  {candidate.names.join(' / ')}
                </Tag>
              ))}
            </Space>
          )}
          {suggestion.warnings.length > 0 && (
            <Space size={4} wrap>
              {suggestion.warnings.map(warning => (
                <Tag key={warning} color="orange">{warning}</Tag>
              ))}
            </Space>
          )}
        </Space>
      )}
    />
  );
}

const ProductCopyPage: React.FC<ProductCopyPageProps> = ({ accountId, accountName }) => {
  const [form] = Form.useForm<{ url: string }>();
  const [parameterForm] = Form.useForm<ProductCopyParameterFormValues>();
  const queryClient = useQueryClient();
  const defaultSettingsAppliedAccountRef = useRef<string | null>(null);
  const [currentStep, setCurrentStep] = useState<ProductCopyWizardStep>('input');
  const [activeSession, setActiveSession] = useState<ProductCopySession | null>(null);
  const [copyRecord, setCopyRecord] = useState<ProductCopyRecord | null>(null);
  const [draftPrepared, setDraftPrepared] = useState<WxDraftBoxProductPrepareResult | null>(null);
  const [draftSuggestion, setDraftSuggestion] = useState<WxProductDraftSuggestionResult | null>(null);
  const [draftSubmittedResult, setDraftSubmittedResult] = useState<WxProductDraftCreationResult | null>(null);
  const [draftDeleteResult, setDraftDeleteResult] = useState<DeleteCreatedWxDraftBoxProductResult | null>(null);
  const [fullCategoryStatus, setFullCategoryStatus] = useState('');
  const [isAdvancedSettingsModalOpen, setIsAdvancedSettingsModalOpen] = useState(false);
  const [, refreshParameterSummary] = useState(0);

  const activeCollectionUrl = activeSession?.url || '';
  const autoCategoryMatch = Form.useWatch('autoCategoryMatch', parameterForm) ?? true;
  const duplicateFilterEnabled = Form.useWatch('duplicateFilter', parameterForm) ?? true;
  const selectedExpressTemplateId = Form.useWatch('expressTemplateId', parameterForm);

  const handleParameterValuesChange = useCallback(() => {
    refreshParameterSummary(version => version + 1);
  }, []);

  const parameterOptionsQuery = useQuery({
    queryKey: queryKeys.productCopy.draftParameterOptions(accountId),
    queryFn: () => extensionApi.productCopy.getDraftParameterOptions(accountId),
    enabled: Boolean(accountId) && (currentStep === 'parameterSettings' || currentStep === 'draftPreview'),
    staleTime: 5 * 60 * 1000,
  });
  const createdProductQuery = useQuery({
    queryKey: queryKeys.productCopy.createdProduct(accountId, copyRecord?.id || ''),
    queryFn: () => extensionApi.productCopy.getCreatedProduct(accountId, copyRecord?.id || ''),
    enabled: Boolean(accountId && copyRecord?.id) && currentStep === 'parameterSettings',
  });
  const defaultSettingsQuery = useQuery({
    queryKey: queryKeys.productCopy.defaultSettings(accountId),
    queryFn: () => extensionApi.productCopy.getDefaultSettings(accountId),
    enabled: Boolean(accountId),
    staleTime: 5 * 60 * 1000,
  });

  const categoryByKey = useMemo(() => {
    return new Map((parameterOptionsQuery.data?.categories || []).map(category => [category.key, category]));
  }, [parameterOptionsQuery.data?.categories]);

  const categoryOptions = useMemo(() => {
    return (parameterOptionsQuery.data?.categories || []).map(category => ({
      value: category.key,
      label: category.path,
    }));
  }, [parameterOptionsQuery.data?.categories]);

  const freightTemplateOptions = useMemo(() => {
    const defaultExpressTemplateId = defaultSettingsQuery.data?.expressTemplateId;
    return (parameterOptionsQuery.data?.freightTemplates || []).map(template => ({
      value: template.templateId,
      label: template.templateId === defaultExpressTemplateId ? `${template.label}（默认）` : template.label,
    }));
  }, [defaultSettingsQuery.data?.expressTemplateId, parameterOptionsQuery.data?.freightTemplates]);

  const afterSaleAddressOptions = useMemo(() => {
    return (parameterOptionsQuery.data?.afterSaleAddresses || []).map(address => ({
      value: address.addressId,
      label: address.label,
    }));
  }, [parameterOptionsQuery.data?.afterSaleAddresses]);

  const saveDefaultSettingsMutation = useMutation({
    mutationFn: async () => {
      await parameterForm.validateFields();
      const values = parameterForm.getFieldsValue(true) as ProductCopyParameterFormValues;
      return extensionApi.productCopy.saveDefaultSettings(accountId, buildDefaultSettingsPatch(values));
    },
    onSuccess: settings => {
      queryClient.setQueryData(queryKeys.productCopy.defaultSettings(accountId), settings);
      parameterForm.setFieldsValue(defaultParameterValues(settings));
      message.success('默认参数已保存');
    },
    onError: error => {
      const detail = error instanceof Error ? error.message : '保存默认参数失败';
      message.error(detail);
    },
  });

  const setDefaultFreightTemplateMutation = useMutation({
    mutationFn: async () => {
      const expressTemplateId = parameterForm.getFieldValue('expressTemplateId');
      if (!expressTemplateId) throw new Error('请先选择运费模板');
      return extensionApi.productCopy.saveDefaultSettings(
        accountId,
        buildDefaultFreightTemplatePatch(defaultSettingsQuery.data, expressTemplateId),
      );
    },
    onSuccess: settings => {
      queryClient.setQueryData(queryKeys.productCopy.defaultSettings(accountId), settings);
      parameterForm.setFieldsValue({ expressTemplateId: settings.expressTemplateId });
      message.success('默认运费模板已保存');
    },
    onError: error => {
      const detail = error instanceof Error ? error.message : '保存默认运费模板失败';
      message.error(detail);
    },
  });

  const wizardItems = useMemo<React.ComponentProps<typeof Steps>['items']>(() => [
    { title: '输入链接' },
    { title: '采集预览' },
    { title: '参数设置' },
    { title: '草稿预览' },
    { title: '创建完成' },
  ], []);

  const resetWizard = useCallback(() => {
    defaultSettingsAppliedAccountRef.current = null;
    form.resetFields();
    parameterForm.setFieldsValue(defaultParameterValues());
    setCurrentStep('input');
    setActiveSession(null);
    setCopyRecord(null);
    setDraftPrepared(null);
    setDraftSuggestion(null);
    setDraftSubmittedResult(null);
    setDraftDeleteResult(null);
    setFullCategoryStatus('');
  }, [form, parameterForm]);

  // 左侧账号切换后必须清空当前向导，避免把上一个账号准备好的草稿请求提交到新账号下。
  useEffect(() => {
    resetWizard();
  }, [accountId, resetWizard]);

  useEffect(() => {
    if (!defaultSettingsQuery.data) return;
    if (defaultSettingsAppliedAccountRef.current === accountId) return;
    defaultSettingsAppliedAccountRef.current = accountId;
    parameterForm.setFieldsValue(defaultParameterValues(defaultSettingsQuery.data));
  }, [accountId, defaultSettingsQuery.data, parameterForm]);

  useEffect(() => {
    const options = parameterOptionsQuery.data;
    if (!options) return;
    const currentValues = parameterForm.getFieldsValue();
    const firstFreightTemplate = options.freightTemplates[0]?.templateId;
    const hasUserSelectedFreightTemplate = parameterForm.isFieldTouched('expressTemplateId');
    const preferredFreightTemplateId = hasUserSelectedFreightTemplate
      ? currentValues.expressTemplateId
      : defaultSettingsQuery.data?.expressTemplateId || currentValues.expressTemplateId || firstFreightTemplate;
    const preferredAddress = options.afterSaleAddresses.find(address => address.defaultRecv)
      || options.afterSaleAddresses.find(address => address.recvAddr)
      || options.afterSaleAddresses[0];
    parameterForm.setFieldsValue({
      expressTemplateId: preferredFreightTemplateId,
      afterSaleAddressId: currentValues.afterSaleAddressId || preferredAddress?.addressId,
    });
  }, [defaultSettingsQuery.data?.expressTemplateId, parameterForm, parameterOptionsQuery.data]);

  const collectMutation = useMutation({
    mutationFn: (url: string) => extensionApi.productCopy.open({ url }),
    onSuccess: session => {
      setActiveSession(session);
      parameterForm.setFieldsValue(defaultParameterValues(defaultSettingsQuery.data));
      setCurrentStep('input');
      setCopyRecord(null);
      setDraftPrepared(null);
      setDraftSuggestion(null);
      setDraftSubmittedResult(null);
      setDraftDeleteResult(null);
      setFullCategoryStatus('');
      setIsAdvancedSettingsModalOpen(false);
      message.success('已打开淘宝工作页采集商品');
    },
    onError: error => {
      const detail = error instanceof Error ? error.message : '商品采集启动失败';
      message.error(detail);
    },
  });

  const categoryOnlyMutation = useMutation({
    onMutate: () => {
      setFullCategoryStatus('正在执行类目转换诊断。');
    },
    mutationFn: async () => {
      if (!copyRecord) throw new Error('请先完成商品采集');
      return extensionApi.productCopy.suggestWxCategoryFromFullList({
        accountId,
        copyId: copyRecord.id,
      });
    },
    onSuccess: suggestion => {
      setDraftSuggestion(suggestion);
      setFullCategoryStatus(`类目转换结果：${normalizedCategoryText(suggestion)}`);
      message.success('类目转换完成');
    },
    onError: error => {
      const detail = error instanceof Error ? error.message : '类目转换失败';
      setFullCategoryStatus(`失败：${detail}`);
      message.error(detail);
    },
  });

  /**
   * “下一步”是正式复制商品路径：
   * 先让后台按当前账号做微信类目转换，再准备微信小店新增商品请求体。
   * 复制商品只负责创建草稿箱商品，因此这里调用 DraftBox 专用命令。
   */
  const generateDraftDataMutation = useMutation({
    onMutate: () => {
      setFullCategoryStatus('正在按参数设置生成草稿箱数据，图片会同步上传到微信小店。');
    },
    mutationFn: async () => {
      if (!copyRecord) throw new Error('请先完成商品采集');
      await parameterForm.validateFields();
      const values = parameterForm.getFieldsValue(true) as ProductCopyParameterFormValues;
      if (values.duplicateFilter) {
        const createdProduct = await extensionApi.productCopy.getCreatedProduct(accountId, copyRecord.id);
        if (createdProduct) {
          throw new Error(`该商品已复制为微信小店商品 ${createdProduct.productId}，如需再次复制请取消重复过滤`);
        }
      }

      let suggestion: WxProductDraftSuggestionResult;
      if (values.autoCategoryMatch) {
        suggestion = await extensionApi.productCopy.suggestWxCategoryFromFullList({
          accountId,
          copyId: copyRecord.id,
        });
      } else {
        const manualCategory = values.categoryKey ? categoryByKey.get(values.categoryKey) : undefined;
        if (!manualCategory) throw new Error('请选择微信小店类目');
        suggestion = manualCategorySuggestion(copyRecord.id, manualCategory);
      }
      const catIds = suggestion.catIds;

      if (!isValidCategoryPathIds(catIds)) {
        throw new Error('微信小店类目路径不完整，请重新选择类目');
      }

      const settingsPatch = buildDefaultSettingsPatch(values);
      const prepared = await extensionApi.productCopy.prepareWxDraftBoxProduct({
        accountId,
        copyId: copyRecord.id,
        catIds,
        brandId: settingsPatch.brandId,
        expressTemplateId: settingsPatch.expressTemplateId,
        afterSaleAddressId: settingsPatch.afterSaleAddressId,
        defaultStockNum: settingsPatch.sku?.defaultStockNum ?? DEFAULT_DRAFT_STOCK_NUM,
        pricing: settingsPatch.pricing,
        content: settingsPatch.content,
        sku: settingsPatch.sku,
      });
      return { suggestion, prepared, catIds };
    },
    onSuccess: ({ suggestion, prepared, catIds }) => {
      setDraftSuggestion(suggestion);
      setDraftPrepared(prepared);
      setDraftSubmittedResult(null);
      setDraftDeleteResult(null);
      setCurrentStep('draftPreview');
      const categoryText = suggestion.categoryPath?.join(' / ') || catIds.join(' / ');
      setFullCategoryStatus(prepared.warnings.length > 0
        ? `已生成：${categoryText}，${prepared.warnings.length} 条商品参数复核提示。`
        : `已生成：${categoryText}`);
      message.success('草稿箱数据已生成');
    },
    onError: error => {
      const detail = error instanceof Error ? error.message : '草稿箱数据生成失败';
      setFullCategoryStatus(`失败：${detail}`);
      message.error(detail);
    },
  });

  const showTestCompletionConfirm = useCallback((result: WxProductDraftCreationResult, productTitle: string) => {
    Modal.confirm({
      title: '测试完成',
      content: `测试草稿已创建到微信小店草稿箱，商品 ID：${result.productId}。是否现在删除这个测试商品？`,
      okText: '删除',
      cancelText: '保留',
      okButtonProps: { danger: true },
      async onOk() {
        const deleteResult = await extensionApi.productCopy.deleteCreatedWxDraftBoxProduct({
          accountId: result.accountId,
          copyId: result.copyId,
          productId: result.productId,
          productTitle,
        });
        if (!deleteResult.deleted) {
          const detail = deleteResult.error || '测试商品删除失败';
          message.error(detail);
          throw new Error(detail);
        }
        setDraftDeleteResult(deleteResult);
        void queryClient.invalidateQueries({ queryKey: queryKeys.productCopy.createdProduct(result.accountId, result.copyId) });
        message.success('测试商品已删除');
      },
    });
  }, [queryClient]);

  const submitPreparedDraftMutation = useMutation({
    mutationFn: () => {
      if (!draftPrepared) throw new Error('请先生成草稿箱数据');
      return extensionApi.productCopy.createPreparedWxDraftBoxProduct({
        accountId: draftPrepared.accountId,
        copyId: draftPrepared.copyId,
        request: {
          ...draftPrepared.request,
          listing: DRAFT_BOX_LISTING_VALUE,
        },
        uploadedImageCount: draftPrepared.uploadedImageCount,
        autoSourceBinding: parameterForm.getFieldValue('autoSourceBinding') !== false,
      });
    },
    onSuccess: result => {
      setDraftSubmittedResult(result);
      setDraftDeleteResult(null);
      setCurrentStep('completed');
      void queryClient.invalidateQueries({ queryKey: queryKeys.productCopy.createdProduct(accountId, result.copyId) });
      message.success(`微信小店草稿已创建：${result.productId}`);
      showTestCompletionConfirm(result, draftPrepared?.request.title || result.productId);
    },
    onError: error => {
      const detail = error instanceof Error ? error.message : '提交微信小店草稿失败';
      message.error(detail);
    },
  });

  useEffect(() => {
    const cleanupCompleted = extensionApi.productCopy.onCompleted(listing => {
      queryClient.setQueryData<ProductCopyRecord[]>(
        queryKeys.productCopy.list,
        current => [listing, ...(current || []).filter(item => item.id !== listing.id)],
      );

      if (activeCollectionUrl && listing.sourceUrl !== activeCollectionUrl) return;
      parameterForm.setFieldsValue(defaultParameterValues(defaultSettingsQuery.data));
      setActiveSession(null);
      setCopyRecord(listing);
      setCurrentStep('collectionPreview');
      setDraftPrepared(null);
      setDraftSuggestion(null);
      setDraftSubmittedResult(null);
      setDraftDeleteResult(null);
      setFullCategoryStatus('');
      message.success('商品采集完成');
    });
    const cleanupFailed = extensionApi.productCopy.onFailed(payload => {
      if (activeCollectionUrl && payload.url !== activeCollectionUrl) return;
      setActiveSession(null);
      message.error(payload.error || '商品采集失败');
    });
    const cleanupChallenge = extensionApi.productCopy.onChallenge(payload => {
      if (activeCollectionUrl && payload.url !== activeCollectionUrl) return;
      message.warning(payload.reason || '淘宝工作页需要登录或安全验证');
    });
    return () => {
      cleanupCompleted();
      cleanupFailed();
      cleanupChallenge();
    };
  }, [activeCollectionUrl, parameterForm, queryClient]);

  const handleCollect = async (values: { url: string }) => {
    const url = values.url.trim();
    setCopyRecord(null);
    setDraftPrepared(null);
    setDraftSuggestion(null);
    setDraftSubmittedResult(null);
    setDraftDeleteResult(null);
    setFullCategoryStatus('');
    await collectMutation.mutateAsync(url);
  };

  const renderCollectionPreview = (listing: ProductCopyRecord): React.ReactNode => {
    const paramColumns: TableProps<ProductCopyRecord['params'][number]>['columns'] = [
      { title: '分组', dataIndex: 'group', width: 120 },
      { title: '参数', dataIndex: 'name', width: 220 },
      { title: '值', dataIndex: 'value' },
    ];
    const skuColumns: TableProps<ProductCopyRecord['sku']['matrix'][number]>['columns'] = [
      {
        title: '规格',
        key: 'specs',
        render: (_: unknown, record) => record.specs.map(spec => `${spec.name}:${spec.value}`).join(' / '),
      },
      { title: '价格', dataIndex: 'priceText', width: 120 },
      { title: '库存', dataIndex: 'stockText', width: 120 },
      { title: '发货', dataIndex: 'logisticsTime', width: 220 },
    ];

    return (
      <Space vertical size={16} style={{ width: '100%' }}>
        <Descriptions
          size="small"
          bordered
          column={2}
          items={[
            { label: '商品 ID', children: listing.identity.itemId },
            { label: '平台', children: listing.identity.platform },
            { label: '店铺', children: listing.shop.name || '-' },
            { label: '原类目', children: sourceCategoryText(listing) },
            { label: '价格', children: listing.price.rangeText || '-' },
            { label: '销量', children: listing.sales.text || '-' },
            { label: '发货', children: listing.delivery.text || '-' },
            { label: 'SKU', children: `${listing.sku.matrix.length} 个 SKU / ${skuSummary(listing)}` },
            { label: '详情来源', children: listing.detail.source },
            { label: '采集时间', children: formatTime(listing.updatedAt) },
            { label: '状态', children: statusTags(listing), span: 2 },
          ]}
        />

        <div>
          {renderSectionTitle('采集主图（原始）', <Tag>{listing.images.main.length} 张</Tag>)}
          {renderImageGroup(listing.images.main, '商品主图')}
        </div>

        <div>
          {renderSectionTitle('采集图文详情（原始）', <Tag>{listing.images.detail.length} 张</Tag>)}
          {renderImageGroup(listing.images.detail, '商品详情图', true)}
        </div>

        <div>
          {renderSectionTitle('商品参数')}
          <Table
            rowKey={record => `${record.group}:${record.name}`}
            size="small"
            pagination={false}
            dataSource={listing.params}
            columns={paramColumns}
          />
        </div>

        <div>
          {renderSectionTitle('SKU 矩阵')}
          <Table
            rowKey="id"
            size="small"
            pagination={{ pageSize: 8, showSizeChanger: false }}
            dataSource={listing.sku.matrix}
            columns={skuColumns}
            scroll={{ x: 720 }}
          />
        </div>

        {renderCategorySuggestion(draftSuggestion)}

        {fullCategoryStatus && (
          <Alert
            type={categoryOnlyMutation.isError || generateDraftDataMutation.isError ? 'error' : 'info'}
            showIcon
            title="处理状态"
            description={fullCategoryStatus}
          />
        )}

        <Collapse
          size="small"
          items={[
            {
              key: 'collection-json',
              label: '采集原始数据',
              children: (
                <Input.TextArea
                  readOnly
                  value={JSON.stringify(listing, null, 2)}
                  autoSize={{ minRows: 10, maxRows: 24 }}
                />
              ),
            },
          ]}
        />
      </Space>
    );
  };

  const renderDraftPreview = (prepared: WxDraftBoxProductPrepareResult): React.ReactNode => {
    const request = prepared.request;
    const parameterValues = parameterForm.getFieldsValue(true) as ProductCopyParameterFormValues;
    const attrRows = (request.attrs || []).map((attr, index) => ({ ...attr, key: `${attr.attr_key}:${index}` }));
    const skuRows = request.skus.map((sku, index) => ({ ...sku, key: sku.sku_code || `${index}` }));
    const attrColumns: TableProps<typeof attrRows[number]>['columns'] = [
      { title: '属性名', dataIndex: 'attr_key', width: 220 },
      { title: '属性值', dataIndex: 'attr_value' },
    ];
    const skuColumns: TableProps<typeof skuRows[number]>['columns'] = [
      {
        title: '规格',
        key: 'sku_attrs',
        render: (_: unknown, record) => record.sku_attrs.map(attr => `${attr.attr_key}:${attr.attr_value}`).join(' / ') || '-',
      },
      {
        title: '价格',
        dataIndex: 'sale_price',
        width: 120,
        render: (value: number) => formatCentPrice(value),
      },
      { title: '库存', dataIndex: 'stock_num', width: 100 },
      { title: 'SKU 编码', dataIndex: 'sku_code', width: 160, render: (value?: string) => value || '-' },
      {
        title: 'SKU 图',
        dataIndex: 'thumb_img',
        width: 88,
        render: (value: string) => value ? (
          <Image
            src={value}
            width={48}
            height={48}
            alt="SKU 图"
            preview={false}
            styles={{ root: { objectFit: 'cover', background: '#f6f8fa', borderRadius: 4 } }}
          />
        ) : '-',
      },
      {
        title: '库存类型',
        key: 'stock_type',
        width: 120,
        render: (_: unknown, record) => `类型 ${record.sku_deliver_info.stock_type}`,
      },
    ];

    return (
      <Space vertical size={16} style={{ width: '100%' }}>
        {renderCategorySuggestion(draftSuggestion)}

        <Descriptions
          size="small"
          bordered
          column={2}
          items={[
            {
              label: '价格规则',
              children: `源价 × ${parameterValues.priceMultiplier ?? 1} + ${parameterValues.priceAddAmountYuan ?? 0} 元，${parameterValues.priceRounding === 'yuan' ? '抹到元' : parameterValues.priceRounding === 'jiao' ? '抹到角' : '保留分'}`,
              span: 2,
            },
            {
              label: '标题处理',
              children: `${parameterValues.titlePrefix ? `前缀「${parameterValues.titlePrefix}」` : '无前缀'} / ${parameterValues.titleSuffix ? `后缀「${parameterValues.titleSuffix}」` : '无后缀'}`,
              span: 2,
            },
            {
              label: '图片处理',
              children: `主图忽略前 ${parameterValues.mainImageSkipFirst ?? 0} / 后 ${parameterValues.mainImageSkipLast ?? 0}；详情图忽略前 ${parameterValues.detailImageSkipFirst ?? 0} / 后 ${parameterValues.detailImageSkipLast ?? 0}${parameterValues.maxDetailImages === undefined ? '' : `，最多 ${parameterValues.maxDetailImages} 张`}`,
              span: 2,
            },
            {
              label: '库存与 SKU',
              children: [
                `默认库存 ${parameterValues.defaultStockNum ?? DEFAULT_DRAFT_STOCK_NUM}`,
                parameterValues.unifiedStockNum === undefined ? '' : `统一库存 ${parameterValues.unifiedStockNum}`,
                parameterValues.zeroStockReplacement === undefined ? '' : `0 库存替换为 ${parameterValues.zeroStockReplacement}`,
                parameterValues.minSkuPriceYuan === undefined ? '' : `删除复制后售价低于 ${parameterValues.minSkuPriceYuan} 元的 SKU`,
              ].filter(Boolean).join('；'),
              span: 2,
            },
            {
              label: '货源关联',
              children: parameterValues.autoSourceBinding === false ? '关闭' : '创建草稿成功后自动关联淘宝货源',
              span: 2,
            },
          ]}
        />

        {prepared.warnings.length > 0 && (
          <Alert
            type="warning"
            showIcon
            title="商品参数已按微信类目规则补齐"
            description={(
              <Space size={4} wrap>
                {prepared.warnings.map(warning => (
                  <Tag key={warning} color="orange">{warning}</Tag>
                ))}
              </Space>
            )}
          />
        )}

        <Descriptions
          size="small"
          bordered
          column={2}
          items={[
            { label: '商品标题', children: request.title, span: 2 },
            { label: '外部商品 ID', children: request.out_product_id },
            { label: '品牌 ID', children: request.brand_id || '-' },
            { label: '微信类目', children: normalizedCategoryText(draftSuggestion), span: 2 },
            { label: '微信类目 ID', children: request.cats_v2.map(cat => cat.cat_id).join(' / ') || '-' },
            { label: '创建位置', children: <Tag color="blue">草稿箱</Tag> },
            { label: '主图', children: `${request.head_imgs.length} 张` },
            { label: '详情图', children: `${request.desc_info?.imgs?.length || 0} 张` },
            { label: 'SKU', children: `${request.skus.length} 个` },
            { label: '商品属性', children: `${request.attrs?.length || 0} 个` },
            { label: '已上传图片', children: prepared.uploadedImageCount },
            { label: '准备时间', children: formatTime(prepared.preparedAt) },
          ]}
        />

        <Descriptions
          size="small"
          bordered
          column={2}
          items={[
            { label: '发货方式', children: request.deliver_method },
            { label: '发货账号类型', children: request.deliver_acct_type.join(' / ') || '-' },
            { label: '运费模板', children: request.express_info?.template_id || '-' },
            { label: '售后地址', children: request.after_sale_info?.after_sale_address_id || '-' },
            { label: '货到付款', children: request.extra_service.is_open_cod },
            { label: '七天无理由', children: request.extra_service.seven_day_return },
            { label: '运费险', children: request.extra_service.freight_insurance },
            { label: '提交标记', children: request.listing },
          ]}
        />

        <div>
          {renderSectionTitle('微信主图', <Tag>{request.head_imgs.length} 张</Tag>)}
          {renderImageGroup(request.head_imgs, '微信商品主图')}
        </div>

        <div>
          {renderSectionTitle('微信图文详情', <Tag>{request.desc_info?.imgs?.length || 0} 张</Tag>)}
          {renderImageGroup(request.desc_info?.imgs || [], '微信商品详情图', true)}
        </div>

        <div>
          {renderSectionTitle('商品属性')}
          <Table
            rowKey="key"
            size="small"
            pagination={false}
            dataSource={attrRows}
            columns={attrColumns}
          />
        </div>

        <div>
          {renderSectionTitle('SKU 列表')}
          <Table
            rowKey="key"
            size="small"
            pagination={{ pageSize: 8, showSizeChanger: false }}
            dataSource={skuRows}
            columns={skuColumns}
            scroll={{ x: 900 }}
          />
        </div>

        <Collapse
          size="small"
          items={[
            {
              key: 'draft-json',
              label: '最终提交请求体',
              children: (
                <Input.TextArea
                  readOnly
                  value={JSON.stringify(request, null, 2)}
                  autoSize={{ minRows: 10, maxRows: 24 }}
                />
              ),
            },
          ]}
        />
      </Space>
    );
  };

  const renderInputStep = (): React.ReactNode => (
    <Space vertical size={16} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        title={`当前账号：${accountName || accountId}`}
        description="当前页面的类目转换、图片上传和草稿创建都会使用左侧选中的账号。"
      />
      <Form form={form} layout="vertical" onFinish={handleCollect}>
        <Form.Item
          name="url"
          label="淘宝/天猫商品链接"
          rules={[{ required: true, message: '请输入淘宝或天猫商品链接' }]}
        >
          <Input
            allowClear
            placeholder="https://item.taobao.com/item.htm?id=..."
            disabled={collectMutation.isPending}
          />
        </Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          icon={<ImportOutlined />}
          loading={collectMutation.isPending}
        >
          开始采集
        </Button>
      </Form>
      {activeSession && (
        <Alert
          type="info"
          showIcon
          title="采集任务已提交"
          description={`当前任务：${activeSession.status} · ${activeSession.url}`}
        />
      )}
    </Space>
  );

  const renderParameterSettingsStep = (): React.ReactNode => {
    const duplicateRecord = duplicateFilterEnabled ? createdProductQuery.data : null;
    const categoryLoading = parameterOptionsQuery.isLoading || parameterOptionsQuery.isFetching;
    const currentParameterValues = {
      ...defaultParameterValues(defaultSettingsQuery.data),
      ...(parameterForm.getFieldsValue(true) as Partial<ProductCopyParameterFormValues>),
    } as ProductCopyParameterFormValues;
    const configuredCounts = advancedSettingsConfiguredCounts(currentParameterValues);
    const parameterSummaryItems = buildParameterSummaryItems(
      currentParameterValues,
      categoryByKey,
      parameterOptionsQuery.data?.freightTemplates || [],
      defaultSettingsQuery.data?.expressTemplateId,
    );
    const currentSettingsPatch = buildDefaultSettingsPatch(currentParameterValues);
    const uploadImagePlan = copyRecord
      ? buildProductCopyImageUploadPlan(copyRecord, {
        pricing: currentSettingsPatch.pricing,
        content: currentSettingsPatch.content,
        sku: currentSettingsPatch.sku,
      })
      : [];
    const selectFilter = (input: string, option?: { label?: React.ReactNode; value?: string }) => {
      const keyword = input.trim().toLowerCase();
      if (!keyword) return true;
      return String(option?.label || '').toLowerCase().includes(keyword)
        || String(option?.value || '').toLowerCase().includes(keyword);
    };

    return (
      <Space vertical size={16} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          title="参数设置"
          description="这些参数会参与生成草稿箱预览；修改参数后需要重新生成草稿预览。"
        />
        {parameterOptionsQuery.isError && (
          <Alert
            type="warning"
            showIcon
            title="参数选项读取失败"
            description={parameterOptionsQuery.error instanceof Error ? parameterOptionsQuery.error.message : '请稍后重试'}
          />
        )}
        {duplicateRecord && (
          <Alert
            type="warning"
            showIcon
            title="重复过滤已命中"
            description={`当前账号已经复制过这个商品，微信小店商品 ID：${duplicateRecord.productId}。取消重复过滤后可以继续复制。`}
          />
        )}
        <Form
          form={parameterForm}
          layout="horizontal"
          labelCol={{ flex: '140px' }}
          wrapperCol={{ flex: 1 }}
          initialValues={defaultParameterValues()}
          onValuesChange={handleParameterValuesChange}
        >
          <div style={compactParameterGridStyle}>
            <Form.Item name="autoCategoryMatch" valuePropName="checked" style={compactParameterItemStyle}>
              <Checkbox>类目匹配：AI 自动识别</Checkbox>
            </Form.Item>
            <Form.Item name="duplicateFilter" valuePropName="checked" style={compactParameterItemStyle}>
              <Checkbox>重复过滤：遇到已复制的记录，自动跳过</Checkbox>
            </Form.Item>
            <Form.Item name="autoSourceBinding" valuePropName="checked" style={compactParameterItemStyle}>
              <Checkbox>货源关联：创建草稿后，把当前淘宝链接自动关联到微信商品</Checkbox>
            </Form.Item>
          </div>
          {!autoCategoryMatch && (
            <Form.Item
              name="categoryKey"
              label="微信类目"
              rules={[{ required: true, message: '请选择微信小店类目' }]}
            >
              <Select
                allowClear
                showSearch={{
                  optionFilterProp: 'label',
                  filterOption: selectFilter,
                }}
                loading={categoryLoading}
                options={categoryOptions}
                placeholder="搜索并选择微信小店类目"
              />
            </Form.Item>
          )}
          <Form.Item label="运费模板" required>
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item
                name="expressTemplateId"
                noStyle
                rules={[{ required: true, message: '请选择运费模板' }]}
              >
                <Select
                  allowClear
                  loading={parameterOptionsQuery.isFetching}
                  options={freightTemplateOptions}
                  placeholder="请选择运费模板"
                />
              </Form.Item>
              <Button
                icon={<ReloadOutlined />}
                loading={parameterOptionsQuery.isFetching}
                onClick={() => parameterOptionsQuery.refetch()}
              >
                刷新
              </Button>
              <Button onClick={() => message.info('请在微信小店后台新增运费模板，新增后点击刷新')}>
                添加
              </Button>
              <Button
                disabled={!selectedExpressTemplateId}
                loading={setDefaultFreightTemplateMutation.isPending}
                onClick={() => setDefaultFreightTemplateMutation.mutate()}
              >
                设为默认
              </Button>
            </Space.Compact>
          </Form.Item>
          <Descriptions
            bordered
            column={2}
            size="small"
            title="当前参数摘要"
            items={parameterSummaryItems}
          />
          <div>
            {renderSectionTitle('实际上传图片清单', (
              <Space size={4}>
                <Tag>{uploadImagePlan.length} 张</Tag>
                <Tag>{uploadImagePlan.reduce((sum, item) => sum + item.candidates.length, 0)} 个候选地址</Tag>
              </Space>
            ))}
            {renderUploadImagePlan(uploadImagePlan)}
          </div>
          <Form.Item label="高级参数">
            <Button onClick={() => setIsAdvancedSettingsModalOpen(true)}>高级参数</Button>
          </Form.Item>
          <Modal
            title="高级参数"
            open={isAdvancedSettingsModalOpen}
            width={860}
            forceRender
            footer={[
              <Button key="done" type="primary" onClick={() => setIsAdvancedSettingsModalOpen(false)}>
                完成
              </Button>,
            ]}
            onCancel={() => setIsAdvancedSettingsModalOpen(false)}
          >
            <Tabs
              size="small"
              items={[
                {
                  key: 'basic',
                  label: advancedSettingsTabLabel('基础配置', configuredCounts.basic),
                  children: (
                    <>
                      <Form.Item name="productStatus" label="复制后商品状态">
                        <Select
                          disabled
                          options={[{ value: 'draftBox', label: '草稿箱（固定）' }]}
                        />
                      </Form.Item>
                      <Form.Item name="afterSaleAddressId" label="售后地址">
                        <Select
                          allowClear
                          loading={parameterOptionsQuery.isFetching}
                          options={afterSaleAddressOptions}
                          placeholder="不选择时自动使用默认售后地址"
                        />
                      </Form.Item>
                      <Form.Item name="brandId" label="品牌 ID">
                        <Input placeholder={DEFAULT_BRAND_ID} />
                      </Form.Item>
                    </>
                  ),
                },
                {
                  key: 'pricing-content',
                  label: advancedSettingsTabLabel('价格与内容', configuredCounts.pricingContent),
                  children: (
                    <>
                      <Form.Item label="售价调整">
                        <Space.Compact block>
                          <Space.Addon>源价 x</Space.Addon>
                          <Form.Item name="priceMultiplier" noStyle>
                            <InputNumber min={0.01} precision={2} step={0.1} style={{ width: 120 }} />
                          </Form.Item>
                          <Space.Addon>+</Space.Addon>
                          <Form.Item name="priceAddAmountYuan" noStyle>
                            <InputNumber min={0} precision={2} step={0.1} style={{ width: 120 }} />
                          </Form.Item>
                          <Space.Addon>元</Space.Addon>
                          <Form.Item name="priceRounding" noStyle>
                            <Select
                              style={{ width: 140 }}
                              options={[
                                { value: 'cent', label: '保留分' },
                                { value: 'jiao', label: '抹到角' },
                                { value: 'yuan', label: '抹到元' },
                              ]}
                            />
                          </Form.Item>
                        </Space.Compact>
                      </Form.Item>
                      <Form.Item name="titlePrefix" label="标题前缀">
                        <Input placeholder="不添加前缀" maxLength={20} showCount />
                      </Form.Item>
                      <Form.Item name="titleSuffix" label="标题后缀">
                        <Input placeholder="不添加后缀" maxLength={20} showCount />
                      </Form.Item>
                      <Form.Item label="主图处理">
                        <Space.Compact block>
                          <Space.Addon>忽略前</Space.Addon>
                          <Form.Item name="mainImageSkipFirst" noStyle>
                            <InputNumber min={0} precision={0} style={{ width: 120 }} />
                          </Form.Item>
                          <Space.Addon>张，忽略后</Space.Addon>
                          <Form.Item name="mainImageSkipLast" noStyle>
                            <InputNumber min={0} precision={0} style={{ width: 120 }} />
                          </Form.Item>
                          <Space.Addon>张</Space.Addon>
                        </Space.Compact>
                      </Form.Item>
                      <Form.Item label="详情图处理">
                        <Space.Compact block>
                          <Space.Addon>忽略前</Space.Addon>
                          <Form.Item name="detailImageSkipFirst" noStyle>
                            <InputNumber min={0} precision={0} style={{ width: 110 }} />
                          </Form.Item>
                          <Space.Addon>张，忽略后</Space.Addon>
                          <Form.Item name="detailImageSkipLast" noStyle>
                            <InputNumber min={0} precision={0} style={{ width: 110 }} />
                          </Form.Item>
                          <Space.Addon>张，最多</Space.Addon>
                          <Form.Item name="maxDetailImages" noStyle>
                            <InputNumber min={0} precision={0} style={{ width: 110 }} />
                          </Form.Item>
                          <Space.Addon>张</Space.Addon>
                        </Space.Compact>
                      </Form.Item>
                    </>
                  ),
                },
                {
                  key: 'sku',
                  label: advancedSettingsTabLabel('库存与 SKU', configuredCounts.sku),
                  children: (
                    <>
                      <Form.Item name="defaultStockNum" label="默认库存">
                        <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="unifiedStockNum" label="统一库存">
                        <InputNumber min={0} precision={0} placeholder="不统一库存" style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="zeroStockReplacement" label="0 库存替换">
                        <InputNumber min={0} precision={0} placeholder="保持 0 库存" style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item label="删除低价 SKU">
                        <Space.Compact block>
                          <Space.Addon>复制后售价 &lt;</Space.Addon>
                          <Form.Item name="minSkuPriceYuan" noStyle>
                            <InputNumber min={0} precision={2} placeholder="不删除" style={{ width: 180 }} />
                          </Form.Item>
                          <Space.Addon>元</Space.Addon>
                        </Space.Compact>
                      </Form.Item>
                    </>
                  ),
                },
              ]}
            />
          </Modal>
        </Form>
        <div style={actionBarStyle}>
          <Button onClick={() => setCurrentStep('collectionPreview')}>上一步</Button>
          <Button
            loading={saveDefaultSettingsMutation.isPending}
            onClick={() => saveDefaultSettingsMutation.mutate()}
          >
            保存为默认参数
          </Button>
          <Button
            type="primary"
            loading={generateDraftDataMutation.isPending}
            disabled={Boolean(duplicateRecord)}
            onClick={() => generateDraftDataMutation.mutate()}
          >
            生成草稿预览
          </Button>
        </div>
      </Space>
    );
  };

  const renderStepContent = (): React.ReactNode => {
    if (currentStep === 'input') return renderInputStep();

    if (currentStep === 'collectionPreview') {
      if (!copyRecord) {
        return <Alert type="warning" showIcon title="暂无采集数据" />;
      }
      return (
        <Space vertical size={16} style={{ width: '100%' }}>
          {renderCollectionPreview(copyRecord)}
          <div style={actionBarStyle}>
            <Button onClick={resetWizard}>重新采集</Button>
            <Space>
              <Button
                icon={<RobotOutlined />}
                loading={categoryOnlyMutation.isPending}
                disabled={generateDraftDataMutation.isPending}
                onClick={() => categoryOnlyMutation.mutate()}
              >
                类目转换
              </Button>
              <Button
                type="primary"
                disabled={categoryOnlyMutation.isPending}
                onClick={() => setCurrentStep('parameterSettings')}
              >
                下一步
              </Button>
            </Space>
          </div>
        </Space>
      );
    }

    if (currentStep === 'parameterSettings') {
      return renderParameterSettingsStep();
    }

    if (currentStep === 'draftPreview') {
      if (!draftPrepared) {
        return <Alert type="warning" showIcon title="暂无草稿箱数据" />;
      }
      return (
        <Space vertical size={16} style={{ width: '100%' }}>
          {renderDraftPreview(draftPrepared)}
          <div style={actionBarStyle}>
            <Button onClick={() => setCurrentStep('parameterSettings')}>上一步</Button>
            <Button
              type="primary"
              loading={submitPreparedDraftMutation.isPending}
              onClick={() => submitPreparedDraftMutation.mutate()}
            >
              创建草稿
            </Button>
          </div>
        </Space>
      );
    }

    if (!draftSubmittedResult) {
      return <Alert type="warning" showIcon title="暂无创建结果" />;
    }
    return (
      <Space vertical size={16} style={{ width: '100%' }}>
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
          title="微信小店草稿创建完成"
          description={(
            <Space size={8} wrap>
              <Tag color="blue">商品 ID {draftSubmittedResult.productId}</Tag>
              <Tag>已上传图片 {draftSubmittedResult.uploadedImageCount}</Tag>
              <Tag>草稿箱</Tag>
              {draftDeleteResult?.deleted && <Tag color="red">测试商品已删除</Tag>}
            </Space>
          )}
        />
        {draftDeleteResult?.deleted && (
          <Alert
            type="info"
            showIcon
            title="测试商品已删除"
            description={`已删除微信小店商品 ID：${draftDeleteResult.productId}`}
          />
        )}
        <Button type="primary" onClick={resetWizard}>继续复制商品</Button>
      </Space>
    );
  };

  return (
    <div style={pageStyle}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>复制商品</h2>
        <p style={{ margin: '8px 0 0', color: '#666', fontSize: 13 }}>
          {accountName || accountId}
        </p>
      </div>

      <Steps
        size="small"
        current={wizardStepIndex[currentStep]}
        items={wizardItems}
      />

      <div style={scrollBodyStyle}>
        <Card size="small">
          {renderStepContent()}
        </Card>
      </div>
    </div>
  );
};

export default ProductCopyPage;
