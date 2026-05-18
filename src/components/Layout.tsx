import React, { useCallback, useEffect, useState } from 'react';
import { extensionApi } from '../shared/extension-api';
import { Layout as AntLayout, Tabs, Empty } from 'antd';
import StoreManagement from '../pages/store-management/StoreManagement';
import SettingsPage from '../pages/settings/SettingsPage';
import OrdersPage from '../pages/orders/OrdersPage';
import ListingPage from '../pages/common-functions/ListingPage';
import ViolationPage from '../pages/violation/ViolationPage';
import { useAccounts } from '../hooks/useAccounts';
import type { Account } from '../shared/types';
import { CredentialErrorProvider } from '../contexts/CredentialErrorContext';

const { Header, Sider, Content } = AntLayout;

type ModuleType = 'orders' | 'storeManagement' | 'commonFunctions' | 'violation' | 'settings';

const ACCOUNT_MODULES = new Set<string>(['orders', 'commonFunctions', 'violation']);

const MODULES: { key: ModuleType; label: string }[] = [
  { key: 'orders', label: '订单管理' },
  { key: 'storeManagement', label: '店铺管理' },
  { key: 'commonFunctions', label: '商品提审' },
  { key: 'violation', label: '违规词检测' },
  { key: 'settings', label: '设置' },
];

/** 账户侧边栏 */
const AccountSider: React.FC<{
  accounts: Account[];
  activeAccountId: string;
  switchAccount: (id: string) => void;
}> = ({ accounts, activeAccountId, switchAccount }) => (
  <Sider width={180} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
    </div>
  </Sider>
);

/** 账户作用域的模块内容（所有页面同时挂载，切换 display 保留状态） */
const AccountModuleContent: React.FC<{
  accounts: Account[];
  activeAccountId: string;
  activeModule: ModuleType;
}> = ({ accounts, activeAccountId, activeModule }) => {
  if (accounts.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description="请先添加店铺" />
      </div>
    );
  }
  return (
    <div style={{ height: '100%', position: 'relative' }}>
      {accounts.map(account => (
        <div
          key={account.id}
          style={{
            height: '100%',
            display: account.id === activeAccountId ? 'contents' : 'none',
          }}
        >
          <div style={{ height: '100%', display: activeModule === 'orders' ? 'flex' : 'none', flexDirection: 'column' }}>
            <OrdersPage accountId={account.id} />
          </div>
          <div style={{ height: '100%', display: activeModule === 'commonFunctions' ? 'flex' : 'none', flexDirection: 'column' }}>
            <ListingPage accountId={account.id} />
          </div>
          <div style={{ height: '100%', display: activeModule === 'violation' ? 'flex' : 'none', flexDirection: 'column' }}>
            <ViolationPage accountId={account.id} />
          </div>
        </div>
      ))}
    </div>
  );
};

const Layout: React.FC = () => {
  const [activeModule, setActiveModule] = useState<ModuleType>('commonFunctions');
  const [version, setVersion] = useState('');
  const [settingsTab, setSettingsTab] = useState<string | undefined>(undefined);
  const { accounts, activeAccountId, fetchAccounts, addAccount, removeAccount, updateAccount, switchAccount } = useAccounts();

  useEffect(() => {
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
            onChange={(key) => setActiveModule(key as ModuleType)}
            items={MODULES.map(m => ({ key: m.key, label: m.label }))}
            size="small"
            style={{ flex: 1, minWidth: 0 }}
            tabBarStyle={{ margin: 0 }}
          />
          <span
            onClick={handleVersionClick}
            style={{ color: '#bbb', fontSize: 12, whiteSpace: 'nowrap', marginLeft: 8, cursor: 'pointer' }}
          >
            v{version}
          </span>
        </Header>
        <AntLayout>
          {isAccountModule && (
            <AccountSider accounts={accounts} activeAccountId={activeAccountId} switchAccount={switchAccount} />
          )}
          <Content style={{ padding: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, minHeight: 0, display: isAccountModule ? 'flex' : 'none', flexDirection: 'column' }}>
              <AccountModuleContent accounts={accounts} activeAccountId={activeAccountId} activeModule={activeModule} />
            </div>
            <div style={{ flex: 1, minHeight: 0, display: activeModule === 'storeManagement' ? 'flex' : 'none', flexDirection: 'column' }}>
              <StoreManagement
                accounts={accounts}
                addAccount={addAccount}
                updateAccount={updateAccount}
                removeAccount={removeAccount}
                switchAccount={switchAccount}
                activeAccountId={activeAccountId}
              />
            </div>
            <div style={{ flex: 1, minHeight: 0, display: activeModule === 'settings' ? 'flex' : 'none', flexDirection: 'column' }}>
              <SettingsPage defaultTab={settingsTab as 'about' | 'product' | 'contact'} />
            </div>
          </Content>
        </AntLayout>
      </AntLayout>
    </CredentialErrorProvider>
  );
};

export default Layout;
