import React, { useEffect, useState } from 'react';
import { extensionApi } from '../../shared/extension-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Descriptions, Form, Image, Input, Menu, Progress, Space, Tag, Typography, message } from 'antd';
import {
  CloudDownloadOutlined,
  InfoCircleOutlined,
  AppstoreOutlined,
  CustomerServiceOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SafetyOutlined,
  ShopOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import wechatQrcode from '../../assets/wechat-qrcode.png';
import douyinQrcode from '../../assets/douyin-qrcode.png';
import type { Account, Config, LicenseState } from '../../shared/types';
import { DEFAULT_AI_SERVICE_SETTINGS } from '../../shared/settings';
import { useAppSettingsQuery, useUpdateAppSettingsMutation } from '../../hooks/useOrderQueries';
import type { SettingsTab } from '../../stores/dashboard-ui-preferences-store';
import { queryKeys } from '../../query/query-keys';
import StoreManagement from '../store-management/StoreManagement';
import PurchaseLinkPanel from './PurchaseLinkPanel';
import ViolationWordsPanel from './ViolationWordsPanel';

const { Title, Paragraph, Text } = Typography;

interface SettingsPageProps {
  accounts: Account[];
  activeAccountId: string;
  addAccount: (name: string, config: Config) => Promise<Account>;
  updateAccount: (id: string, patch: Partial<Pick<Account, 'name' | 'config'>>) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  switchAccount: (id: string) => Promise<void>;
  defaultTab?: SettingsTab;
  onTabChange?: (tab: SettingsTab) => void;
}

const MENU_ITEMS = [
  { key: 'store', label: '店铺管理', icon: <ShopOutlined /> },
  { key: 'violationWords', label: '违禁词管理', icon: <SafetyOutlined /> },
  { key: 'about', label: '关于/更新', icon: <InfoCircleOutlined /> },
  { key: 'product', label: '产品介绍', icon: <AppstoreOutlined /> },
  { key: 'license', label: '授权状态', icon: <SafetyCertificateOutlined /> },
  { key: 'aiService', label: 'AI 服务', icon: <RobotOutlined /> },
  { key: 'purchaseLink', label: '采购关联', icon: <LinkOutlined /> },
  { key: 'baseData', label: '基础数据', icon: <CloudDownloadOutlined /> },
  { key: 'contact', label: '联系我们', icon: <CustomerServiceOutlined /> },
];

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN');
}

/** 关于 */
const AboutPanel: React.FC = () => {
  const [version, setVersion] = useState('');

  useEffect(() => {
    extensionApi.app.version().then((v: string) => setVersion(v));
  }, []);

  return (
    <Card title="关于">
      <Descriptions column={1} style={{ maxWidth: 500 }}>
        <Descriptions.Item label="应用名称">店小七 (Dianxiaoqi)</Descriptions.Item>
        <Descriptions.Item label="当前版本">v{version}</Descriptions.Item>
      </Descriptions>
    </Card>
  );
};

/** 产品介绍 */
const ProductPanel: React.FC = () => {
  const features = [
    { title: '商品提审', desc: '批量提交商品审核，支持定时调度，自动处理审核结果' },
    { title: '商品合规扫描', desc: '扫描商品标题中的违禁词，批量处理不合规商品' },
    { title: '订单管理', desc: '多账户订单查看、搜索、详情查看、地址解密' },
    { title: '多账户管理', desc: '一个应用管理多个微信小店，账户数据完全隔离' },
  ];

  return (
    <Card title="产品介绍">
      <Title level={4}>店小七 (Dianxiaoqi)</Title>
      <Paragraph style={{ maxWidth: 600, color: '#555' }}>
        店小七是一款专为微信小店商家打造的桌面效率工具，帮助你高效管理多个店铺的商品上架、审核和合规检测流程。
      </Paragraph>
      <div style={{ marginTop: 24 }}>
        <Title level={5}>核心功能</Title>
        {features.map((f, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <Text strong>{f.title}</Text>
            <br />
            <Text type="secondary">{f.desc}</Text>
          </div>
        ))}
      </div>
    </Card>
  );
};

const LicensePanel: React.FC = () => {
  const [license, setLicense] = useState<LicenseState | null>(null);
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);

  const loadLicense = async () => {
    const state = await extensionApi.license.get();
    setLicense(state);
    setLicenseKey(state.licenseKey || '');
  };

  useEffect(() => {
    void loadLicense();
  }, []);

  const activate = async () => {
    setLoading(true);
    try {
      const state = await extensionApi.license.activate({ licenseKey });
      setLicense(state);
      message.success('授权信息已保存');
    } catch (error: any) {
      message.error(error?.message || '保存授权失败');
    } finally {
      setLoading(false);
    }
  };

  const clear = async () => {
    setLoading(true);
    try {
      const state = await extensionApi.license.clear();
      setLicense(state);
      setLicenseKey('');
      message.success('授权信息已清除');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="授权状态">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="授权拦截暂未启用"
        description="当前版本只保存授权结构和本地状态，不会限制订单、提审、合规扫描或发货功能。服务端完成后可打开统一授权开关。"
      />
      <Descriptions column={1} style={{ maxWidth: 620 }}>
        <Descriptions.Item label="授权开关">
          <Tag color={license?.enforcementEnabled ? 'red' : 'default'}>
            {license?.enforcementEnabled ? '已启用' : '未启用'}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="授权状态">{license?.status || '-'}</Descriptions.Item>
        <Descriptions.Item label="套餐">{license?.plan || '-'}</Descriptions.Item>
        <Descriptions.Item label="设备 ID">{license?.deviceId || '-'}</Descriptions.Item>
        <Descriptions.Item label="最近检查">
          {license?.checkedAt ? new Date(license.checkedAt).toLocaleString('zh-CN') : '-'}
        </Descriptions.Item>
      </Descriptions>
      <Space.Compact style={{ width: 520, maxWidth: '100%', marginTop: 16 }}>
        <Input.Password
          value={licenseKey}
          onChange={(e) => setLicenseKey(e.target.value)}
          placeholder="输入激活码"
        />
        <Button type="primary" loading={loading} onClick={activate}>保存</Button>
      </Space.Compact>
      <div style={{ marginTop: 12 }}>
        <Button danger loading={loading} onClick={clear}>清除授权信息</Button>
      </div>
    </Card>
  );
};

interface AiServiceFormValues {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const AiServicePanel: React.FC = () => {
  const [form] = Form.useForm<AiServiceFormValues>();
  const settingsQuery = useAppSettingsQuery();
  const updateSettingsMutation = useUpdateAppSettingsMutation();

  useEffect(() => {
    const settings = settingsQuery.data?.aiService;
    if (!settings) return;
    form.setFieldsValue(settings);
  }, [form, settingsQuery.data?.aiService]);

  const save = async (values: AiServiceFormValues) => {
    await updateSettingsMutation.mutateAsync({
      aiService: {
        baseUrl: values.baseUrl,
        apiKey: values.apiKey,
        model: values.model,
      },
    });
    message.success('AI 服务设置已保存');
  };

  return (
    <Card title="AI 服务">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="OpenAI 兼容配置仅保存在本机浏览器存储"
        description="复制商品等模块会统一调用这里配置的 AI 服务。地址请填写 API 根地址，例如 https://api.openai.com/v1。"
      />
      <Form
        form={form}
        layout="vertical"
        initialValues={DEFAULT_AI_SERVICE_SETTINGS}
        onFinish={save}
        style={{ maxWidth: 620 }}
      >
        <Form.Item
          name="baseUrl"
          label="OpenAI 兼容地址"
        >
          <Input allowClear placeholder="https://api.openai.com/v1" />
        </Form.Item>
        <Form.Item
          name="model"
          label="模型名称"
        >
          <Input allowClear placeholder="gpt-4o-mini" />
        </Form.Item>
        <Form.Item
          name="apiKey"
          label="API Key"
        >
          <Input.Password allowClear placeholder="sk-..." />
        </Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          loading={settingsQuery.isLoading || updateSettingsMutation.isPending}
        >
          保存设置
        </Button>
      </Form>
    </Card>
  );
};

interface BaseDataPanelProps {
  accounts: Account[];
  activeAccountId: string;
}

const BaseDataPanel: React.FC<BaseDataPanelProps> = ({ accounts, activeAccountId }) => {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: queryKeys.wxCategoryData.productRuleCacheStatus,
    queryFn: () => extensionApi.wxCategoryData.getProductRuleCacheStatus(),
    refetchInterval: query => query.state.data?.syncing ? 2000 : false,
  });

  const downloadMutation = useMutation({
    mutationFn: () => {
      const accountId = activeAccountId || accounts[0]?.id || '';
      if (!accountId) throw new Error('请先配置微信小店账号');
      return extensionApi.wxCategoryData.downloadProductRules({ accountId });
    },
    onSuccess: async result => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.wxCategoryData.productRuleCacheStatus });
      message.success(result.started ? '已开始下载微信类目云端数据' : '微信类目云端数据正在下载中');
    },
    onError: error => {
      const detail = error instanceof Error ? error.message : '下载微信类目云端数据失败';
      message.error(detail);
    },
  });

  const status = statusQuery.data;
  const percent = status?.total
    ? Math.round(((status.cached + status.failed) / status.total) * 100)
    : 0;

  return (
    <Card title="微信类目云端数据">
      <Space direction="vertical" size={12} style={{ width: '100%', maxWidth: 760 }}>
        <Space size={6} wrap>
          <Tag>总类目 {status?.total ?? '-'}</Tag>
          <Tag color="green">已下载 {status?.cached ?? '-'}</Tag>
          <Tag color={status?.failed ? 'orange' : 'default'}>失败 {status?.failed ?? '-'}</Tag>
          <Tag color={status?.missing ? 'blue' : 'default'}>缺失 {status?.missing ?? '-'}</Tag>
          {status?.lastUpdatedAt && (
            <Tag>最近更新 {formatTime(status.lastUpdatedAt)}</Tag>
          )}
        </Space>
        <Progress
          percent={percent}
          size="small"
          status={status?.failed ? 'exception' : status?.syncing ? 'active' : 'normal'}
        />
        {status?.syncing && (
          <Alert
            type="info"
            showIcon
            title="微信类目云端数据下载中"
            description={`已处理 ${status.processed}/${status.total}，跳过 ${status.skipped}，当前：${status.currentPath || status.currentCatId || '-'}`}
          />
        )}
        {status?.lastError && !status.syncing && (
          <Alert
            type="error"
            showIcon
            title="上次下载失败"
            description={status.lastError}
          />
        )}
        <Space>
          <Button
            type="primary"
            icon={<CloudDownloadOutlined />}
            loading={downloadMutation.isPending}
            disabled={accounts.length === 0 || status?.syncing}
            onClick={() => downloadMutation.mutate()}
          >
            下载云端类目数据
          </Button>
          <Button
            onClick={() => statusQuery.refetch()}
            loading={statusQuery.isFetching}
          >
            刷新状态
          </Button>
        </Space>
      </Space>
    </Card>
  );
};

/** 联系我们 */
const ContactPanel: React.FC = () => (
  <Card title="联系我们">
    <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }}>
      <div style={{ textAlign: 'center' }}>
        <Title level={5}>微信</Title>
        <Image
          src={wechatQrcode}
          alt="微信二维码"
          width={200}
          height={200}
          style={{ borderRadius: 8, border: '1px solid #f0f0f0' }}
          preview={false}
          fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect fill='%23f5f5f5' width='200' height='200'/%3E%3Ctext x='100' y='108' text-anchor='middle' fill='%23999' font-size='14'%3E请放入 wechat-qrcode.png%3C/text%3E%3C/svg%3E"
        />
        <div style={{ marginTop: 8, color: '#999', fontSize: 13 }}>扫码添加微信</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <Title level={5}>抖音</Title>
        <Image
          src={douyinQrcode}
          alt="抖音二维码"
          width={200}
          height={200}
          style={{ borderRadius: 8, border: '1px solid #f0f0f0' }}
          preview={false}
          fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect fill='%23f5f5f5' width='200' height='200'/%3E%3Ctext x='100' y='108' text-anchor='middle' fill='%23999' font-size='14'%3E请放入 douyin-qrcode.png%3C/text%3E%3C/svg%3E"
        />
        <div style={{ marginTop: 8, color: '#999', fontSize: 13 }}>扫码关注抖音</div>
      </div>
    </div>
  </Card>
);

const SettingsPage: React.FC<SettingsPageProps> = ({ accounts, activeAccountId, addAccount, updateAccount, removeAccount, switchAccount, defaultTab = 'about', onTabChange }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      <Menu
        mode="inline"
        selectedKeys={[activeTab]}
        onClick={({ key }) => {
          const nextTab = key as SettingsTab;
          setActiveTab(nextTab);
          onTabChange?.(nextTab);
        }}
        items={MENU_ITEMS}
        style={{ width: 160, height: '100%', borderRight: '1px solid #f0f0f0' }}
      />
      <div style={{ flex: 1, padding: 24, overflow: 'auto' }}>
        {activeTab === 'store' && (
          <StoreManagement
            accounts={accounts}
            activeAccountId={activeAccountId}
            addAccount={addAccount}
            updateAccount={updateAccount}
            removeAccount={removeAccount}
            switchAccount={switchAccount}
          />
        )}
        {activeTab === 'violationWords' && <ViolationWordsPanel />}
        {activeTab === 'about' && <AboutPanel />}
        {activeTab === 'product' && <ProductPanel />}
        {activeTab === 'license' && <LicensePanel />}
        {activeTab === 'aiService' && <AiServicePanel />}
        {activeTab === 'purchaseLink' && <PurchaseLinkPanel />}
        {activeTab === 'baseData' && <BaseDataPanel accounts={accounts} activeAccountId={activeAccountId} />}
        {activeTab === 'contact' && <ContactPanel />}
      </div>
    </div>
  );
};

export default SettingsPage;
