/**
 * 店小七 Dashboard 主布局。
 *
 * 「复制商品」业务域下，Dashboard 只有一个顶级 Tab：复制商品。
 * 顶部展示版本号、淘宝登录态指示器；底部固定通知中心 + 活动日志抽屉。
 */
import React, { Suspense, lazy, useEffect, useState } from 'react';
import { extensionApi } from '../shared/extension-api';
import { Layout as AntLayout, Tabs, Empty, Spin, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import ActivityLogDrawer from './ActivityLogDrawer';
import NotificationCenter from './NotificationCenter';
import { useAccounts } from '../hooks/useAccounts';
import { BUILD_TIME } from '../shared/build-info';
import type { Account } from '../shared/types';
import { CredentialErrorProvider } from '../contexts/CredentialErrorContext';
import { TaobaoLoginProvider, TaobaoLoginIndicator } from '../contexts/TaobaoLoginContext';
import {
  useDashboardUiPreferencesStore,
  type DashboardModuleType,
  type SettingsTab,
} from '../stores/dashboard-ui-preferences-store';

const { Header, Sider, Content } = AntLayout;

const ProductCopyPage = lazy(() => import('../pages/product-copy/ProductCopyPage'));

const MODULES: { key: DashboardModuleType; label: string }[] = [
  { key: 'productCopy', label: '复制商品' },
];

const PageFallback: React.FC = () => (
  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <Spin />
  </div>
);

/** 复制商品页面的左侧账号侧边栏 */
const AccountSider: React.FC<{
  accounts: Account[];
  activeAccountId: string;
  switchAccount: (id: string) => void;
}> = ({ accounts, activeAccountId, switchAccount }) => (
  <Sider width={180} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
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
  const { accounts, activeAccountId, fetchAccounts, addAccount, removeAccount, updateAccount, switchAccount } = useAccounts();
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

  const navigateToStoreSettings = () => {
    // 添加店铺的空状态入口：直接跳到「复制商品」tab，ProductCopyPage 自身提供
    // 添加账号能力（顶部添加账号按钮）。不再需要单独的 settings 页面。
    setActiveModule('productCopy');
  };

  if (accounts.length === 0) {
    return (
      <TaobaoLoginProvider>
        <CredentialErrorProvider onNavigateToSettings={navigateToStoreSettings}>
          <AntLayout style={{ height: '100vh' }}>
            <Header style={{ padding: '0 12px', height: 48, lineHeight: '48px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>店小七</div>
              <TaobaoLoginIndicator />
            </Header>
            <Content style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <Empty description="还没有店铺，先添加一个微信小店账号" />
                <Button type="primary" icon={<PlusOutlined />} onClick={navigateToStoreSettings}>添加店铺</Button>
              </div>
            </Content>
            <NotificationCenter />
            <ActivityLogDrawer />
          </AntLayout>
        </CredentialErrorProvider>
      </TaobaoLoginProvider>
    );
  }

  return (
    <TaobaoLoginProvider>
      <CredentialErrorProvider onNavigateToSettings={navigateToStoreSettings}>
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

export default Layout;
