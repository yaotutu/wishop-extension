/**
 * 店小七 Dashboard 主布局。
 *
 * 顶级 Tab：
 *  - 复制商品（主功能）
 *  - 店铺管理（次要功能：绑定/解绑微信小店账号）
 *
 * 顶部展示版本号、淘宝登录态指示器；底部固定通知中心 + 活动日志抽屉。
 * 当账号列表为空时，整个 Dashboard 退化为"添加第一个店铺"的引导页。
 */
import React, { Suspense, lazy, useEffect, useState } from 'react';
import { extensionApi } from '../shared/extension-api';
import { Layout as AntLayout, Tabs, Empty, Spin, Button, Form, Input, Modal, App as AntApp } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import ActivityLogDrawer from './ActivityLogDrawer';
import NotificationCenter from './NotificationCenter';
import { useAccounts } from '../hooks/useAccounts';
import { BUILD_TIME } from '../shared/build-info';
import type { Account, Config } from '../shared/types';
import { CredentialErrorProvider } from '../contexts/CredentialErrorContext';
import { TaobaoLoginProvider, TaobaoLoginIndicator } from '../contexts/TaobaoLoginContext';
import {
  useDashboardUiPreferencesStore,
  type DashboardModuleType,
} from '../stores/dashboard-ui-preferences-store';

const { Header, Sider, Content } = AntLayout;

const ProductCopyPage = lazy(() => import('../pages/product-copy/ProductCopyPage'));
const StoreManagementPage = lazy(() => import('../pages/store-management/StoreManagementPage'));

const MODULES: { key: DashboardModuleType; label: string }[] = [
  { key: 'productCopy', label: '复制商品' },
  { key: 'storeManagement', label: '店铺管理' },
];

const PageFallback: React.FC = () => (
  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <Spin />
  </div>
);

/** 复制商品页面的左侧账号侧边栏，顶部带"管理店铺"按钮 */
const AccountSider: React.FC<{
  accounts: Account[];
  activeAccountId: string;
  switchAccount: (id: string) => void;
  onManageStores: () => void;
}> = ({ accounts, activeAccountId, switchAccount, onManageStores }) => (
  <Sider width={180} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
    <div
      onClick={onManageStores}
      style={{
        padding: '10px 16px',
        cursor: 'pointer',
        fontSize: 12,
        color: '#666',
        borderBottom: '1px solid #f0f0f0',
        background: '#fafafa',
      }}
    >
      店铺管理 ›
    </div>
    <div style={{ padding: '12px 16px 8px', fontWeight: 500, fontSize: 13, color: '#999' }}>
      账号列表
    </div>
    <div style={{ flex: 1, overflow: 'auto' }}>
      {accounts.map((account, index) => (
        <div
          key={account.id}
          onClick={() => switchAccount(account.id)}
          style={{
            padding: '8px 16px',
            cursor: 'pointer',
            background: account.id === activeAccountId ? '#e6f4ff' : 'transparent',
            borderLeft: account.id === activeAccountId ? '3px solid #1677ff' : '3px solid transparent',
            fontSize: 13,
            userSelect: 'none',
            transition: 'background 0.2s',
          }}
        >
          {index + 1}. {account.name}
        </div>
      ))}
    </div>
  </Sider>
);

const Layout: React.FC = () => {
  const [version, setVersion] = useState('');
  const {
    accounts, activeAccountId, fetchAccounts, addAccount, removeAccount, switchAccount,
  } = useAccounts();
  const {
    activeModule,
    hydrate,
    setActiveModule,
  } = useDashboardUiPreferencesStore();

  useEffect(() => {
    void hydrate();
    fetchAccounts();
    extensionApi.app.version().then((v: string) => setVersion(v));
  }, []);

  const goStoreManagement = () => setActiveModule('storeManagement');

  if (accounts.length === 0) {
    return (
      <TaobaoLoginProvider>
        <CredentialErrorProvider onNavigateToSettings={goStoreManagement}>
          <EmptyStateWithBindDialog addAccount={addAccount} switchAccount={switchAccount} />
        </CredentialErrorProvider>
      </TaobaoLoginProvider>
    );
  }

  return (
    <TaobaoLoginProvider>
      <CredentialErrorProvider onNavigateToSettings={goStoreManagement}>
        <AntLayout style={{ height: '100vh' }}>
          <Header style={{ padding: '0 12px', height: 48, lineHeight: '48px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center' }}>
            <Tabs
              activeKey={activeModule}
              onChange={(key) => setActiveModule(key as DashboardModuleType)}
              items={MODULES.map(m => ({ key: m.key, label: m.label }))}
              size="small"
              style={{ flex: 1, minWidth: 0 }}
              tabBarStyle={{ margin: 0 }}
            />
            <span
              style={{ color: '#bbb', fontSize: 12, whiteSpace: 'nowrap', marginLeft: 8 }}
            >
              v{version} · 构建 {BUILD_TIME}
            </span>
            <TaobaoLoginIndicator />
          </Header>
          <AntLayout>
            <AccountSider
              accounts={accounts}
              activeAccountId={activeAccountId}
              switchAccount={switchAccount}
              onManageStores={goStoreManagement}
            />
            <Content style={{ padding: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <Suspense fallback={<PageFallback />}>
                {activeModule === 'productCopy' && (
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <ProductCopyPage
                      accountId={activeAccountId}
                      accountName={accounts.find(a => a.id === activeAccountId)?.name || ''}
                    />
                  </div>
                )}
                {activeModule === 'storeManagement' && (
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <StoreManagementPage
                      accounts={accounts}
                      activeAccountId={activeAccountId}
                      addAccount={addAccount}
                      removeAccount={removeAccount}
                      switchAccount={switchAccount}
                      onAdded={(account) => {
                        setActiveModule('productCopy');
                        switchAccount(account.id);
                      }}
                    />
                  </div>
                )}
              </Suspense>
            </Content>
          </AntLayout>
          <NotificationCenter />
          <ActivityLogDrawer />
        </AntLayout>
      </CredentialErrorProvider>
    </TaobaoLoginProvider>
  );
};

/** 还没绑定任何店铺时，整页展示"先添加一个店铺"的引导 + 绑定对话框 */
const EmptyStateWithBindDialog: React.FC<{
  addAccount: (name: string, config: Config) => Promise<Account>;
  switchAccount: (id: string) => Promise<void>;
}> = ({ addAccount, switchAccount }) => {
  const { message } = AntApp.useApp();
  const [version, setVersion] = useState('');
  const [bindOpen, setBindOpen] = useState(false);
  const [binding, setBinding] = useState(false);
  const [form] = Form.useForm<{ name: string; appId: string; appSecret: string }>();

  useEffect(() => {
    extensionApi.app.version().then((v: string) => setVersion(v));
  }, []);

  const handleBind = async () => {
    try {
      const values = await form.validateFields();
      setBinding(true);
      const account = await addAccount(values.name, {
        appId: values.appId.trim(),
        appSecret: values.appSecret.trim(),
      });
      message.success(`已绑定「${account.name}」`);
      await switchAccount(account.id);
      form.resetFields();
      setBindOpen(false);
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setBinding(false);
    }
  };

  return (
    <AntLayout style={{ height: '100vh' }}>
      <Header style={{ padding: '0 12px', height: 48, lineHeight: '48px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>店小七</div>
        <span style={{ color: '#bbb', fontSize: 12, whiteSpace: 'nowrap' }}>
          v{version} · 构建 {BUILD_TIME}
        </span>
        <TaobaoLoginIndicator />
      </Header>
      <Content style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, maxWidth: 480 }}>
          <Empty
            imageStyle={{ height: 80 }}
            description={
              <div style={{ fontSize: 14 }}>
                <div style={{ marginBottom: 8 }}>还没有绑定任何店铺</div>
                <div style={{ color: '#999', fontSize: 12 }}>
                  复制商品需要至少绑定一个微信小店账号（AppID + AppSecret）。
                </div>
              </div>
            }
          />
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setBindOpen(true)}>
            绑定第一个店铺
          </Button>
        </div>
      </Content>
      <Modal
        title="绑定店铺"
        open={bindOpen}
        onCancel={() => { if (!binding) { setBindOpen(false); form.resetFields(); } }}
        onOk={handleBind}
        confirmLoading={binding}
        okText="绑定"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="name"
            label="店铺名（自己起，方便区分）"
            rules={[{ required: true, message: '请填店铺名' }]}
          >
            <Input placeholder="例如：主店" maxLength={50} />
          </Form.Item>
          <Form.Item
            name="appId"
            label="AppID"
            rules={[{ required: true, message: '请填 AppID' }]}
          >
            <Input placeholder="微信公众平台 → 开发管理 → 开发者ID" />
          </Form.Item>
          <Form.Item
            name="appSecret"
            label="AppSecret"
            rules={[{ required: true, message: '请填 AppSecret' }]}
          >
            <Input.Password placeholder="仅本机存储，不会上传" />
          </Form.Item>
        </Form>
      </Modal>
      <NotificationCenter />
      <ActivityLogDrawer />
    </AntLayout>
  );
};

export default Layout;
