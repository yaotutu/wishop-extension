import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { TaobaoRefundPrepareSnapshot, TaobaoRefundSession } from '../../shared/types';
import { extensionApi } from '../../shared/extension-api';
import { detectTaobaoSecurityChallenge } from './adapters/security-challenge-adapter';
import {
  hasTaobaoRefundShipmentSignals,
  prepareTaobaoRefundApplyPage,
  readTaobaoRefundPrepareSnapshot,
  submitTaobaoRefundApplyPage,
} from './adapters/refund-apply-adapter';

interface Props {
  session: TaobaoRefundSession;
}

function snapshotLines(snapshot: TaobaoRefundPrepareSnapshot): string[] {
  return [
    `淘宝订单：${snapshot.platformOrderId || '-'}`,
    `退款原因：${snapshot.selectedReason || '-'}`,
    `退款金额：${snapshot.refundAmountText || '-'}`,
    `提交按钮：${snapshot.submitReady ? '已就绪' : '未就绪'}`,
  ];
}

function waitForRefundSubmitSettled(): Promise<void> {
  return new Promise(resolve => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const text = document.body.innerText || document.body.textContent || '';
      const settled = location.pathname.includes('/dispute/detail.htm')
        || text.includes('卖家处理退款申请')
        || text.includes('退款详情')
        || text.includes('协商详情')
        || text.includes('退款成功');
      if (settled || Date.now() - startedAt > 8000) {
        window.clearInterval(timer);
        resolve();
      }
    }, 500);
  });
}

export const TaobaoRefundToolbar: React.FC<Props> = ({ session }) => {
  const [snapshot, setSnapshot] = useState<TaobaoRefundPrepareSnapshot>(() => readTaobaoRefundPrepareSnapshot(session.platformOrderId));
  const [statusText, setStatusText] = useState('正在准备淘宝退款申请页');
  const [completed, setCompleted] = useState(session.status === 'prepared' || session.status === 'submitted');
  const [waitingVerification, setWaitingVerification] = useState(session.status === 'waiting-user-verification');
  const preparingRef = useRef(false);

  const prepareRefund = useCallback(async () => {
    if (preparingRef.current || completed) return;
    const challenge = detectTaobaoSecurityChallenge();
    if (challenge.detected) {
      setWaitingVerification(true);
      setStatusText('淘宝退款页需要处理验证，请完成后继续');
      await extensionApi.taobaoRefund.reportChallenge(session.id, challenge).catch(() => {});
      return;
    }
    if (waitingVerification) {
      setWaitingVerification(false);
      await extensionApi.taobaoRefund.resolveChallenge(session.id).catch(() => {});
    }

    preparingRef.current = true;
    setStatusText(`正在选择退款原因：${session.reason}`);
    try {
      const next = prepareTaobaoRefundApplyPage(session.reason, session.platformOrderId);
      setSnapshot(next);
      if (next.selectedReason !== session.reason) {
        preparingRef.current = false;
        setStatusText(`已点击退款原因，等待页面更新为：${session.reason}`);
        return;
      }
      if (!next.submitReady) {
        preparingRef.current = false;
        setStatusText('退款原因已选择，等待淘宝提交按钮就绪');
        return;
      }
      if (session.autoSubmit && hasTaobaoRefundShipmentSignals()) {
        await extensionApi.taobaoRefund.prepared(session.id, next);
        setCompleted(true);
        setStatusText('页面出现发货后退款字段，已转为人工处理，不自动提交');
        return;
      }
      if (session.autoSubmit) {
        setStatusText('退款原因已选择，正在自动提交淘宝退款申请');
        const submitted = submitTaobaoRefundApplyPage(session.platformOrderId);
        setSnapshot(submitted);
        await waitForRefundSubmitSettled();
        await extensionApi.taobaoRefund.submitted(session.id, submitted);
        setCompleted(true);
        setStatusText('已点击淘宝提交，退款申请已送出');
        return;
      }

      await extensionApi.taobaoRefund.prepared(session.id, next);
      setCompleted(true);
      setStatusText('退款原因已选择，该采购单需要人工确认后手动提交');
    } catch (err) {
      preparingRef.current = false;
      const message = err instanceof Error ? err.message : '未知错误';
      setStatusText(`准备失败：${message}`);
      await extensionApi.taobaoRefund.fail(session.id, message).catch(() => {});
    }
  }, [completed, session.autoSubmit, session.id, session.platformOrderId, session.reason, waitingVerification]);

  useEffect(() => {
    void extensionApi.taobaoRefund.markPageReady(session.id).catch(() => {});
  }, [session.id]);

  useEffect(() => {
    const timers = [800, 1800, 3200].map(delay => window.setTimeout(() => {
      void prepareRefund();
    }, delay));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [prepareRefund]);

  useEffect(() => {
    if (!waitingVerification || completed) return;
    const timer = window.setInterval(() => {
      const challenge = detectTaobaoSecurityChallenge();
      if (!challenge.detected) void prepareRefund();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [completed, prepareRefund, waitingVerification]);

  return (
    <section className="wishop-purchase-lookup">
      <div className="wishop-purchase-lookup__header">
        <strong>微店管家正在准备淘宝退款</strong>
        <span>{completed ? (session.autoSubmit ? '已自动提交' : '待手动提交') : '请保持此页面打开'}</span>
      </div>
      <div className="wishop-purchase-lookup__body">
        <p>{statusText}</p>
        <ul>
          {snapshotLines(snapshot).map(line => <li key={line}>{line}</li>)}
        </ul>
      </div>
      <div className="wishop-purchase-lookup__actions">
        <button type="button" onClick={() => void prepareRefund()} disabled={preparingRef.current && !completed}>
          {waitingVerification ? '我已完成验证，继续准备' : '重新准备'}
        </button>
      </div>
      <small>{session.autoSubmit ? '无物流信息订单会自动点击淘宝“提交”。' : '已有物流信息订单不自动提交，请人工处理退款。'}</small>
    </section>
  );
};
