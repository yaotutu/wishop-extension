import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { extensionApi } from '../shared/extension-api';
import { Layout as AntLayout, Tabs, Empty, Spin } from 'antd';
import ActivityLogDrawer from './ActivityLogDrawer';
import NotificationCenter from './NotificationCenter';
import { useAccounts } from '../hooks/useAccounts';
import { BUILD_TIME } from '../shared/build-info';
import type { Account } from '../shared/types';
import type { OrderScope } from '../shared/types';
import { CredentialErrorProvider } from '../contexts/CredentialErrorContext';
import {
  useDashboardUiPreferencesStore,
  type DashboardModuleType,
  type ProductReviewGlobalView,
  type ProductReviewScope,
  type SettingsTab,
} from '../stores/dashboard-ui-preferences-store';

const { Header, Sider, Content } = AntLayout;

const StoreManagement = lazy(() => import('../pages/store-management/StoreManagement'));
const SettingsPage = lazy(() => import('../pages/settings/SettingsPage'));
const OrdersPage = lazy(() => import('../pages/orders/OrdersPage'));
const ProductListingPage = lazy(() => import('../pages/product-listing/ProductListingPage'));
const ProductAuditPage = lazy(() => import('../pages/common-functions/ProductAuditPage'));
const ScheduledJobsPage = lazy(() => import('../pages/scheduled-jobs/ScheduledJobsPage'));
const ViolationPage = lazy(() => import('../pages/violation/ViolationPage'));

const ACCOUNT_MODULES = new Set<string>(['orders', 'commonFunctions', 'violation']);

const MODULES: { key: DashboardModuleType; label: string }[] = [
  { key: 'orders', label: '订单管理' },
  { key: 'storeManagement', label: '店铺管理' },
  { key: 'productListing', label: '上货管理' },
  { key: 'commonFunctions', label: '商品提审' },
  { key: 'scheduledJobs', label: '调度任务' },
  { key: 'violation', label: '违规词检测' },
  { key: 'settings', label: '设置' },
];

const PageFallback: React.FC = () => (
  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <Spin />
  </div>
);

/** 账户侧边栏 */
const AccountSider: React.FC<{
  accounts: Account[];
  activeAccountId: string;
  activeModule: DashboardModuleType;
  orderScopeType: OrderScope['type'];
  setOrderScopeType: (scope: OrderScope['type']) => void;
  productReviewScope: ProductReviewScope;
  productReviewGlobalView: ProductReviewGlobalView;
  setProductReviewScope: (scope: ProductReviewScope) => void;
  setProductReviewGlobalView: (view: ProductReviewGlobalView) => void;
  switchAccount: (id: string) => void;
}> = ({ accounts, activeAccountId, activeModule, orderScopeType, setOrderScopeType, productReviewScope, productReviewGlobalView, setProductReviewScope, setProductReviewGlobalView, switchAccount }) => (
  <Sider width={180} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {(activeModule === 'commonFunctions' || activeModule === 'orders') && (
        <div style={{ padding: '8px 8px 10px', borderBottom: '1px solid #f0f0f0' }}>
          <div
            onClick={() => {
              if (activeModule === 'orders') setOrderScopeType('all');
              else {
                setProductReviewScope('global');
                setProductReviewGlobalView('tasks');
              }
            }}
            style={{
              padding: '8px 10px',
              cursor: 'pointer',
              background: activeModule === 'orders' && orderScopeType === 'all' ? '#e6f4ff' : '#fafafa',
              border: activeModule === 'orders' && orderScopeType === 'all' ? '1px solid #91caff' : '1px solid #f0f0f0',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: activeModule === 'commonFunctions' && productReviewScope === 'global' ? 600 : 500,
              color: activeModule === 'commonFunctions' && productReviewScope === 'global' ? '#222' : undefined,
              userSelect: 'none',
            }}
          >
            全部账号
          </div>
          {activeModule === 'commonFunctions' && productReviewScope === 'global' && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {([
                { key: 'tasks', label: '每日自动提审' },
                { key: 'rules', label: '失败处理规则' },
              ] satisfies Array<{ key: ProductReviewGlobalView; label: string }>).map(item => (
                <div
                  key={item.key}
                  onClick={() => {
                    setProductReviewScope('global');
                    setProductReviewGlobalView(item.key);
                  }}
                  style={{
                    padding: '7px 10px 7px 18px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    color: productReviewGlobalView === item.key ? '#1677ff' : '#666',
                    background: productReviewGlobalView === item.key ? '#f0f7ff' : 'transparent',
                    fontSize: 12,
                    fontWeight: productReviewGlobalView === item.key ? 600 : 400,
                    userSelect: 'none',
                  }}
                >
                  {item.label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{ padding: '12px 16px 8px', fontWeight: 500, fontSize: 13, color: '#999' }}>
        账号列表
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {accounts.map((account, index) => (
          <div
            key={account.id}
            onClick={() => {
              if (activeModule === 'commonFunctions') setProductReviewScope('account');
              if (activeModule === 'orders') setOrderScopeType('account');
              switchAccount(account.id);
            }}
            style={{
              padding: '8px 16px',
              cursor: 'pointer',
              background: (activeModule === 'orders' ? orderScopeType === 'account' : activeModule !== 'commonFunctions' || productReviewScope === 'account') && account.id === activeAccountId ? '#e6f4ff' : 'transparent',
              borderLeft: (activeModule === 'orders' ? orderScopeType === 'account' : activeModule !== 'commonFunctions' || productReviewScope === 'account') && account.id === activeAccountId ? '3px solid #1677ff' : '3px solid transparent',
              fontSize: 13,
              userSelect: 'none',
              transition: 'background 0.2s',
            }}
          >
            {index + 1}. {account.name}
          </div>
        ))}
      </div>
    </div>
  </Sider>
);

/** 账户作用域的模块内容：只渲染当前模块，避免首屏加载所有业务页面 chunk。 */
const AccountModuleContent: React.FC<{
  accounts: Account[];
  activeAccountId: string;
  activeModule: DashboardModuleType;
  orderScopeType: OrderScope['type'];
  productReviewScope: ProductReviewScope;
  productReviewGlobalView: ProductReviewGlobalView;
}> = ({ accounts, activeAccountId, activeModule, orderScopeType, productReviewScope, productReviewGlobalView }) => {
  if (accounts.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description="请先添加店铺" />
      </div>
    );
  }
  if (activeModule === 'commonFunctions' && productReviewScope === 'global') {
    return <ProductAuditPage accountId={activeAccountId} accounts={accounts} scope="global" globalView={productReviewGlobalView} />;
  }
  const activeAccount = accounts.find(account => account.id === activeAccountId) || accounts[0];
  const orderScope: OrderScope = orderScopeType === 'all'
    ? { type: 'all' }
    : { type: 'account', accountId: activeAccount.id };
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {activeModule === 'orders' && <OrdersPage scope={orderScope} accounts={accounts} />}
      {activeModule === 'commonFunctions' && <ProductAuditPage accountId={activeAccount.id} accounts={accounts} scope="account" />}
      {activeModule === 'violation' && <ViolationPage accountId={activeAccount.id} />}
    </div>
  );
};

const Layout: React.FC = () => {
  const [version, setVersion] = useState('');
  const [orderScopeType, setOrderScopeType] = useState<OrderScope['type']>('all');
  const { accounts, activeAccountId, fetchAccounts, addAccount, removeAccount, updateAccount, switchAccount } = useAccounts();
  const {
    activeModule,
    productReviewScope,
    productReviewGlobalView,
    settingsTab,
    hydrate,
    setActiveModule,
    setProductReviewScope,
    setProductReviewGlobalView,
    setSettingsTab,
  } = useDashboardUiPreferencesStore();

  useEffect(() => {
    void hydrate();
    fetchAccounts();
    extensionApi.app.version().then((v: string) => setVersion(v));
  }, []);

  const isAccountModule = ACCOUNT_MODULES.has(activeModule);

  const navigateToStoreManagement = useCallback(() => {
    setActiveModule('storeManagement');
  }, []);

  const handleVersionClick = () => {
    setSettingsTab('about');
    setActiveModule('settings');
  };

  return (
    <CredentialErrorProvider onNavigateToSettings={navigateToStoreManagement}>
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
            onClick={handleVersionClick}
            style={{ color: '#bbb', fontSize: 12, whiteSpace: 'nowrap', marginLeft: 8, cursor: 'pointer' }}
          >
            v{version} · 构建 {BUILD_TIME}
          </span>
        </Header>
        <AntLayout>
          {isAccountModule && (
            <AccountSider
              accounts={accounts}
              activeAccountId={activeAccountId}
              activeModule={activeModule}
              orderScopeType={orderScopeType}
              setOrderScopeType={setOrderScopeType}
              productReviewScope={productReviewScope}
              productReviewGlobalView={productReviewGlobalView}
              setProductReviewScope={setProductReviewScope}
              setProductReviewGlobalView={setProductReviewGlobalView}
              switchAccount={switchAccount}
            />
          )}
          <Content style={{ padding: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Suspense fallback={<PageFallback />}>
              <div style={{ flex: 1, minHeight: 0, display: isAccountModule ? 'flex' : 'none', flexDirection: 'column' }}>
                <AccountModuleContent
                  accounts={accounts}
                  activeAccountId={activeAccountId}
                  activeModule={activeModule}
                  orderScopeType={orderScopeType}
                  productReviewScope={productReviewScope}
                  productReviewGlobalView={productReviewGlobalView}
                />
              </div>
              {activeModule === 'storeManagement' && (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <StoreManagement
                    accounts={accounts}
                    addAccount={addAccount}
                    updateAccount={updateAccount}
                    removeAccount={removeAccount}
                    switchAccount={switchAccount}
                    activeAccountId={activeAccountId}
                  />
                </div>
              )}
              {activeModule === 'scheduledJobs' && (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <ScheduledJobsPage accounts={accounts} />
                </div>
              )}
              {activeModule === 'productListing' && (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <ProductListingPage accounts={accounts} activeAccountId={activeAccountId} />
                </div>
              )}
              {activeModule === 'settings' && (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <SettingsPage defaultTab={settingsTab} onTabChange={(tab: SettingsTab) => setSettingsTab(tab)} />
                </div>
              )}
            </Suspense>
          </Content>
        </AntLayout>
        <NotificationCenter />
        <ActivityLogDrawer />
      </AntLayout>
    </CredentialErrorProvider>
  );
};

export default Layout;
