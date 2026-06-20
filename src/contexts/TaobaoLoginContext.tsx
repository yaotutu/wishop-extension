import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Modal, Button, Tag } from 'antd';
import { extensionApi } from '../shared/extension-api';
import type { TaobaoLoginSnapshot, TaobaoLoginState } from '../shared/types';

/**
 * 淘宝登录态上下文。
 *
 * 职责：
 * 1. 维护后台登录态快照（订阅 taobaoLogin:changed 事件 + 启动时拉一次），
 *    驱动 Header 上的登录态指示器（绿/红/灰）。
 * 2. 当变为 logged-out 时弹 Modal，引导用户去登录（按钮调用后台打开淘宝登录页）。
 * 3. 暴露 useTaobaoLogin，供各页面读取登录态、手动复检、识别登录拦截错误。
 *
 * 不持久化登录态：它是后台内存态的镜像，SW 重启后回到 unknown，由心跳/操作重新填充。
 */
interface TaobaoLoginContextValue {
  state: TaobaoLoginState;
  snapshot: TaobaoLoginSnapshot | null;
  /** 手动触发一次即时探测（更新指示器）。 */
  refresh: () => void;
}

const TaobaoLoginContext = createContext<TaobaoLoginContextValue>({
  state: 'unknown',
  snapshot: null,
  refresh: () => {},
});

export function useTaobaoLogin(): TaobaoLoginContextValue {
  return useContext(TaobaoLoginContext);
}

export const TaobaoLoginProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [snapshot, setSnapshot] = useState<TaobaoLoginSnapshot | null>(null);
  // 是否已经为本次"未登录"弹过 Modal，避免事件反复触发时重复弹窗。
  // 当状态切回 logged-in 时重置，下次未登录可再次提醒。
  const [modalDismissed, setModalDismissed] = useState(false);

  // 启动时拉一次当前登录态，并订阅变化事件。
  useEffect(() => {
    let cancelled = false;
    void extensionApi.taobaoLogin.getState().then(initial => {
      if (!cancelled) setSnapshot(initial);
    }).catch(() => {});
    const off = extensionApi.taobaoLogin.onLoginChanged(next => {
      setSnapshot(next);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  // 状态切回已登录时，重置 dismiss 标记，下次未登录可再次弹 Modal。
  useEffect(() => {
    if (snapshot?.state === 'logged-in') {
      setModalDismissed(false);
    }
  }, [snapshot?.state]);

  const state = snapshot?.state ?? 'unknown';

  const refresh = useCallback(() => {
    void extensionApi.taobaoLogin.probeNow()
      .then(next => setSnapshot(next))
      .catch(() => {});
  }, []);

  const handleGoToLogin = useCallback(() => {
    setModalDismissed(true);
    void extensionApi.taobaoLogin.openLoginPage().catch(() => {});
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalDismissed(true);
  }, []);

  // 未登录且本次未弹过 Modal 时，展示引导 Modal。
  const modalVisible = state === 'logged-out' && !modalDismissed;

  return (
    <TaobaoLoginContext.Provider value={{ state, snapshot, refresh }}>
      {children}
      <Modal
        open={modalVisible}
        title="淘宝未登录"
        onCancel={handleCloseModal}
        footer={[
          <Button key="close" onClick={handleCloseModal}>稍后再说</Button>,
          <Button key="login" type="primary" onClick={handleGoToLogin}>去登录</Button>,
        ]}
      >
        <p>{snapshot?.reason || '检测到淘宝/天猫未登录，订单读取、发货、退款等操作将无法执行。'}</p>
        <p style={{ color: '#999', fontSize: 13 }}>
          点击「去登录」会打开淘宝登录页，完成登录后指示器会自动恢复。
        </p>
      </Modal>
    </TaobaoLoginContext.Provider>
  );
};

/**
 * Header 上的登录态指示器小标签。绿=已登录，红=未登录，灰=检测中。
 * 点击可手动复检。放在 Layout 的 Header 版本号旁边。
 */
export const TaobaoLoginIndicator: React.FC = () => {
  const { state, refresh } = useTaobaoLogin();
  if (state === 'logged-in') {
    return <Tag color="success" style={{ marginLeft: 8, cursor: 'pointer' }} onClick={refresh}>淘宝已登录</Tag>;
  }
  if (state === 'logged-out') {
    return <Tag color="error" style={{ marginLeft: 8, cursor: 'pointer' }} onClick={refresh}>淘宝未登录</Tag>;
  }
  return <Tag color="default" style={{ marginLeft: 8, cursor: 'pointer' }} onClick={refresh}>淘宝检测中</Tag>;
};
