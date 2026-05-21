import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PurchaseLookupSession, TaobaoPurchaseOrderSnapshot } from '../../shared/types';
import { extensionApi } from '../../shared/extension-api';
import { detectTaobaoSecurityChallenge } from './adapters/security-challenge-adapter';
import {
  isPurchaseOrderSnapshotUseful,
  readTaobaoPurchaseOrderSnapshot,
} from './adapters/order-detail-adapter';

interface Props {
  session: PurchaseLookupSession;
}

function snapshotLines(snapshot: TaobaoPurchaseOrderSnapshot): string[] {
  return [
    `淘宝订单：${snapshot.platformOrderId || '-'}`,
    `订单状态：${snapshot.platformOrderStatus || '-'}`,
    `物流状态：${snapshot.logisticsStatus || '-'}`,
    `快递公司：${snapshot.logisticsCompany || '-'}`,
    `快递单号：${snapshot.trackingNumber || '-'}`,
  ];
}

export const PurchaseLookupToolbar: React.FC<Props> = ({ session }) => {
  const [snapshot, setSnapshot] = useState<TaobaoPurchaseOrderSnapshot>(() => readTaobaoPurchaseOrderSnapshot(session.platformOrderId));
  const [statusText, setStatusText] = useState('正在读取淘宝订单信息');
  const [completed, setCompleted] = useState(false);
  const [waitingVerification, setWaitingVerification] = useState(session.status === 'waiting-user-verification');
  const completingRef = useRef(false);

  const readAndComplete = useCallback(async () => {
    if (completingRef.current) return;
    const challenge = detectTaobaoSecurityChallenge();
    if (challenge.detected) {
      setWaitingVerification(true);
      setStatusText('淘宝工作页需要处理验证，请完成后继续读取');
      await extensionApi.purchaseLookup.reportChallenge(session.id, challenge).catch(() => {});
      return;
    }
    if (waitingVerification) {
      setWaitingVerification(false);
      await extensionApi.purchaseLookup.resolveChallenge(session.id).catch(() => {});
    }
    const next = readTaobaoPurchaseOrderSnapshot(session.platformOrderId);
    setSnapshot(next);
    if (!isPurchaseOrderSnapshotUseful(next)) {
      setStatusText('暂未读取到订单状态或物流信息，可等待页面加载完成后重试');
      return;
    }

    completingRef.current = true;
    setStatusText('已读取到淘宝订单信息，正在回填采购单详情');
    try {
      await extensionApi.purchaseLookup.complete(session.id, next);
      setCompleted(true);
      setStatusText('读取完成，采购单详情已更新');
    } catch (err) {
      completingRef.current = false;
      const message = err instanceof Error ? err.message : '未知错误';
      setStatusText(`回填失败：${message}`);
      await extensionApi.purchaseLookup.fail(session.id, message).catch(() => {});
    }
  }, [session.id, session.platformOrderId, waitingVerification]);

  useEffect(() => {
    void extensionApi.purchaseLookup.markPageReady(session.id).catch(() => {});
  }, [session.id]);

  useEffect(() => {
    const timers = [1200, 3000, 6000].map(delay => window.setTimeout(() => {
      if (!completed) void readAndComplete();
    }, delay));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [completed, readAndComplete]);

  useEffect(() => {
    if (!waitingVerification || completed) return;
    const timer = window.setInterval(() => {
      const challenge = detectTaobaoSecurityChallenge();
      if (!challenge.detected) void readAndComplete();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [completed, readAndComplete, waitingVerification]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (completed) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [completed]);

  return (
    <section className="wishop-purchase-lookup">
      <div className="wishop-purchase-lookup__header">
        <strong>微店管家正在读取淘宝订单</strong>
        <span>{completed ? '已完成' : '请保持此页面打开'}</span>
      </div>
      <div className="wishop-purchase-lookup__body">
        <p>{statusText}</p>
        <ul>
          {snapshotLines(snapshot).map(line => <li key={line}>{line}</li>)}
        </ul>
      </div>
      <div className="wishop-purchase-lookup__actions">
        <button type="button" onClick={() => void readAndComplete()} disabled={completingRef.current && !completed}>
          {waitingVerification ? '我已完成验证，继续读取' : '重新读取'}
        </button>
      </div>
      <small>关闭或刷新此淘宝工作页，会中断订单状态和物流信息读取。</small>
    </section>
  );
};
