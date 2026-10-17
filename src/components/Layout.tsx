/**
 * 店小七 Dashboard 主布局。
 *
 * 顶级 Tab（独立平等，没有依赖关系）：
 *  - 复制商品（主功能）：用户输入淘宝链接 → 抓取 → AI 类目/参数整理 → 预览
 *  - 店铺管理（次要功能）：绑定 / 解绑微信小店账号；账号用于把生成的草稿提交到对应小店
 *
 * 顶部展示版本号、淘宝登录态指示器；底部固定通知中心 + 活动日志抽屉。
 * 即使还没有绑定任何店铺，用户也可以正常进入"复制商品" tab，浏览流程。
 */
import React, { Suspense, lazy, useEffect, useState } from 'react';
import { extensionApi } from '../shared/extension-api';
import { Layout as AntLayout, Tabs, Empty, Spin, Button } from 'antd';
import { ShopOutlined } from '@ant-design/icons';
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

/** 复制商品页面的左侧账号侧边栏。账号为空时展示空态。 */
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
    {accounts.length === 0 ? (
      <div style={{ padding: '12px 16px', fontSize: 12, color: '#999' }}>
        <div>暂未绑定店铺</div>
        <Button
          type="link"
          size="small"
          icon={<ShopOutlined />}
          onClick={onManageStores}
          style={{ padding: 0, marginTop: 4 }}
        >
          去绑定
        </Button>
      </div>
    ) : (
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
    )}
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
  const goProductCopy = () => setActiveModule('productCopy');

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
            {activeModule === 'productCopy' && (
              <AccountSider
                accounts={accounts}
                activeAccountId={activeAccountId}
                switchAccount={switchAccount}
                onManageStores={goStoreManagement}
              />
            )}
            <Content style={{ padding: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <Suspense fallback={<PageFallback />}>
                {activeModule === 'productCopy' && (
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <ProductCopyPage
                      accountId={activeAccountId}
                      accountName={accounts.find(a => a.id === activeAccountId)?.name || ''}
                      onNavigateToStoreManagement={goStoreManagement}
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
                    />
                  </div>
                )}
                {accounts.length === 0 && activeModule === 'productCopy' && (
                  <div style={{ display: 'none' }} />
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
