import React, { createContext, useContext, useState, useCallback } from 'react';
import { Modal, Button } from 'antd';
import { isCredentialError, getCredentialMessage } from '../shared/errors';

interface CredentialErrorContextValue {
  reportCredentialError: (error: unknown) => void;
}

const CredentialErrorContext = createContext<CredentialErrorContextValue>({
  reportCredentialError: () => {},
});

export function useCredentialError() {
  return useContext(CredentialErrorContext);
}

interface CredentialErrorProviderProps {
  onNavigateToSettings: () => void;
  children: React.ReactNode;
}

export function CredentialErrorProvider({ onNavigateToSettings, children }: CredentialErrorProviderProps) {
  const [message, setMessage] = useState<string | null>(null);

  const reportCredentialError = useCallback((error: unknown) => {
    if (!isCredentialError(error)) return;
    setMessage(getCredentialMessage(error));
  }, []);

  const handleClose = useCallback(() => {
    setMessage(null);
  }, []);

  const handleGoToSettings = useCallback(() => {
    setMessage(null);
    onNavigateToSettings();
  }, [onNavigateToSettings]);

  return (
    <CredentialErrorContext.Provider value={{ reportCredentialError }}>
      {children}
      <Modal
        open={!!message}
        title="凭证配置异常"
        onCancel={handleClose}
        footer={[
          <Button key="close" onClick={handleClose}>关闭</Button>,
          <Button key="go" type="primary" onClick={handleGoToSettings}>前往配置</Button>,
        ]}
      >
        <p>{message}</p>
        <p style={{ color: '#999', fontSize: 13 }}>
          请前往「店铺管理」页面检查并更新该店铺的 AppID 和 AppSecret。
        </p>
      </Modal>
    </CredentialErrorContext.Provider>
  );
}
