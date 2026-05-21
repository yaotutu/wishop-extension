import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { OrderAddressInfo, OrderRealAddressCache, ShippingSession } from '../../shared/types';
import { extensionApi } from '../../shared/extension-api';
import { formatOrderAddressForCopy } from '../../shared/address-format';
import { useShippingToolbarStore, type ShippingToolbarPosition } from '../../stores/shipping-toolbar-store';
import { readTaobaoPageSnapshot, type TaobaoPageSnapshot } from './adapters/page-adapter';
import { fillTaobaoCheckoutAddress, normalizeCheckoutAddress } from './adapters/checkout-address-adapter';

interface Props {
  session: ShippingSession;
}

function skuText(session: ShippingSession): string {
  const attrs = session.order.skuAttrs
    .map(attr => [attr.attr_key, attr.attr_value].filter(Boolean).join(': '))
    .filter(Boolean)
    .join(' / ');
  return attrs || session.order.skuCode || '无规格';
}

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

function formatPrice(cents?: number): string {
  if (cents === undefined || cents === null) return '-';
  return `¥${(cents / 100).toFixed(2)}`;
}

function formatRate(rate?: number): string {
  if (rate === undefined || Number.isNaN(rate)) return '-';
  return `${(rate * 100).toFixed(1)}%`;
}

function formatTime(timestamp?: number): string {
  if (!timestamp) return '-';
  return new Date(timestamp * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function addressText(address?: OrderAddressInfo): string {
  return formatOrderAddressForCopy(address);
}

function noteText(label: string, value?: string): string {
  return value?.trim() ? `${label}：${value.trim()}` : '';
}

function formatFetchedAt(timestamp?: number): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPurchaseAssociationStatus(status?: string): string {
  if (status === 'waiting-payment') return '等待付款完成';
  if (status === 'detected') return '已检测到订单';
  if (status === 'associated') return '已关联';
  if (status === 'failed') return '关联失败';
  return '等待付款完成';
}

function clampPosition(position: ShippingToolbarPosition, width = 380): ShippingToolbarPosition {
  const maxLeft = Math.max(8, window.innerWidth - Math.min(width, window.innerWidth - 16) - 8);
  const maxTop = Math.max(8, window.innerHeight - 80);
  return {
    top: Math.min(Math.max(8, position.top), maxTop),
    left: Math.min(Math.max(8, position.left), maxLeft),
  };
}

export const ShippingToolbar: React.FC<Props> = ({ session }) => {
  const [currentSession, setCurrentSession] = useState(session);
  const activeSession = currentSession;
  const [snapshot, setSnapshot] = useState<TaobaoPageSnapshot>(() => readTaobaoPageSnapshot());
  const [notice, setNotice] = useState('');
  const [addressCache, setAddressCache] = useState<OrderRealAddressCache | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressFilling, setAddressFilling] = useState(false);
  const [checkoutAddressDebugVisible, setCheckoutAddressDebugVisible] = useState(false);
  const collapsed = useShippingToolbarStore(state => state.collapsed);
  const position = useShippingToolbarStore(state => state.position);
  const hydrateToolbarState = useShippingToolbarStore(state => state.hydrate);
  const setCollapsed = useShippingToolbarStore(state => state.setCollapsed);
  const setPosition = useShippingToolbarStore(state => state.setPosition);
  const toolbarRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTop: number;
    startLeft: number;
  } | null>(null);

  useEffect(() => {
    setCurrentSession(session);
  }, [session]);

  useEffect(() => {
    void hydrateToolbarState().then(() => {
      const current = useShippingToolbarStore.getState().position;
      setPosition(clampPosition(current), false);
    }).catch(() => {});
  }, [hydrateToolbarState, setPosition]);

  useEffect(() => {
    void extensionApi.shipping.markPageReady(activeSession.id).catch(() => {});
  }, [activeSession.id]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      extensionApi.shipping.getCurrentTabSession()
        .then(latest => {
          if (latest) setCurrentSession(latest);
        })
        .catch(() => {});
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    extensionApi.orderRealAddresses.get(activeSession.accountId, activeSession.orderId)
      .then(cache => setAddressCache(cache))
      .catch(() => {});
  }, [activeSession.accountId, activeSession.orderId]);

  useEffect(() => {
    const handleResize = () => {
      const next = clampPosition(useShippingToolbarStore.getState().position, toolbarRef.current?.offsetWidth || 380);
      setPosition(next, false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setPosition]);

  useEffect(() => {
    let lastHref = location.href;
    let lastSnapshotKey = '';
    const timer = window.setInterval(() => {
      const currentSnapshot = readTaobaoPageSnapshot();
      const snapshotKey = [
        currentSnapshot.pageType,
        currentSnapshot.url,
        currentSnapshot.checkoutPayAmountText,
        currentSnapshot.checkoutPayAmountCents,
      ].join('|');
      if (location.href === lastHref && snapshotKey === lastSnapshotKey) return;
      lastHref = location.href;
      lastSnapshotKey = snapshotKey;
      setSnapshot(currentSnapshot);
      if (currentSnapshot.pageType !== 'checkout') {
        setCheckoutAddressDebugVisible(false);
        setAddressFilling(false);
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  const refreshSnapshot = useCallback(() => {
    const nextSnapshot = readTaobaoPageSnapshot();
    setSnapshot(nextSnapshot);
    if (nextSnapshot.pageType !== 'checkout') {
      setCheckoutAddressDebugVisible(false);
    }
    setNotice('已重新读取页面');
  }, []);

  const handleDragStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTop: position.top,
      startLeft: position.left,
    };
  }, [position.left, position.top]);

  const handleDragMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = clampPosition({
      top: drag.startTop + event.clientY - drag.startY,
      left: drag.startLeft + event.clientX - drag.startX,
    }, toolbarRef.current?.offsetWidth || 380);
    setPosition(next, false);
  }, [setPosition]);

  const handleDragEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    const next = clampPosition(position, toolbarRef.current?.offsetWidth || 380);
    setPosition(next, true);
  }, [position, setPosition]);

  const copyOrderInfo = useCallback(async () => {
    const address = addressCache?.address || activeSession.order.address;
    const lines = [
      `订单号：${activeSession.orderId}`,
      `商品：${activeSession.order.title}`,
      `规格：${skuText(activeSession)}`,
      `数量：${activeSession.order.quantity}`,
      `实付：${formatPrice(activeSession.order.orderPrice)}`,
      `预估手续费：${formatPrice(activeSession.order.estimatedCommissionFee)}`,
      `下单：${formatTime(activeSession.order.createTime)}`,
      `支付：${formatTime(activeSession.order.payTime)}`,
      noteText('买家备注', activeSession.order.customerNotes),
      noteText('商家备注', activeSession.order.merchantNotes),
      addressText(address) ? `地址：${addressText(address).replace('\n', ' ')}` : '',
      activeSession.source.remark ? `货源备注：${activeSession.source.remark}` : '',
    ].filter(Boolean);
    await copyText(lines.join('\n'));
    setNotice('订单信息已复制');
  }, [addressCache, activeSession]);

  const copyAddress = useCallback(async () => {
    const address = addressCache?.address || activeSession.order.address;
    const text = addressText(address);
    if (!text) {
      setNotice('当前会话没有地址信息');
      return;
    }
    await copyText(text);
    setNotice('地址已复制');
  }, [addressCache, activeSession.order.address]);

  const fetchRealAddress = useCallback(async (forceRefresh = false) => {
    setAddressLoading(true);
    try {
      const cache = forceRefresh
        ? await extensionApi.orderRealAddresses.refresh(activeSession.accountId, activeSession.orderId)
        : await extensionApi.orderRealAddresses.fetch(activeSession.accountId, activeSession.orderId);
      setAddressCache(cache);
      setNotice('');
    } catch (err) {
      setNotice(`获取真实地址失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setAddressLoading(false);
    }
  }, [activeSession.accountId, activeSession.orderId]);

  const handleFillCheckoutAddress = useCallback(async () => {
    setAddressFilling(true);
    try {
      const address = addressCache?.address
        || activeSession.order.address
        || (await extensionApi.orderRealAddresses.fetch(activeSession.accountId, activeSession.orderId)).address;
      const result = await fillTaobaoCheckoutAddress(address);
      if (result.filledFields.length > 0) {
        setNotice(`已填充：${result.filledFields.join('、')}${result.warnings.length ? `；${result.warnings.join('；')}` : ''}`);
      } else {
        setNotice(result.warnings.join('；') || '未能填充地址');
      }
      if (!addressCache?.address) {
        void extensionApi.orderRealAddresses.get(activeSession.accountId, activeSession.orderId)
          .then(cache => setAddressCache(cache))
          .catch(() => {});
      }
    } catch (err) {
      setNotice(`填充地址失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setAddressFilling(false);
    }
  }, [addressCache?.address, activeSession.accountId, activeSession.order.address, activeSession.orderId]);

  const copySku = useCallback(async () => {
    await copyText(skuText(activeSession));
    setNotice('SKU 已复制');
  }, [activeSession]);

  const copyNotes = useCallback(async () => {
    const text = [
      noteText('买家备注', activeSession.order.customerNotes),
      noteText('商家备注', activeSession.order.merchantNotes),
      noteText('货源备注', activeSession.source.remark),
    ].filter(Boolean).join('\n');
    if (!text) {
      setNotice('当前没有备注');
      return;
    }
    await copyText(text);
    setNotice('备注已复制');
  }, [activeSession]);

  if (collapsed) {
    return (
      <section
        ref={toolbarRef}
        className="wishop-shipping-toolbar wishop-shipping-toolbar--collapsed"
        style={{ top: position.top, left: position.left }}
      >
        <button
          type="button"
          className="wishop-shipping-collapsed-button"
          onClick={() => setCollapsed(false)}
          title="展开微店管家发货助手"
        >
          发货助手
        </button>
      </section>
    );
  }

  const address = addressCache?.address || activeSession.order.address;
  const fetchedAt = formatFetchedAt(addressCache?.fetchedAt);
  const isCheckoutPage = snapshot.pageType === 'checkout';
  const orderPrice = activeSession.order.orderPrice;
  const commissionFee = activeSession.order.estimatedCommissionFee;
  const purchaseCost = snapshot.checkoutPayAmountCents;
  const estimatedProfit = orderPrice !== undefined && commissionFee !== undefined && purchaseCost !== undefined
    ? orderPrice - commissionFee - purchaseCost
    : undefined;
  const estimatedProfitRate = estimatedProfit !== undefined && orderPrice
    ? estimatedProfit / orderPrice
    : undefined;
  const checkoutAddressPreview = isCheckoutPage && address
    ? normalizeCheckoutAddress(address)
    : null;
  const purchaseAssociationVisible = Boolean(activeSession.purchaseAssociationStatus || activeSession.linkedPlatformOrderId);

  return (
    <section
      ref={toolbarRef}
      className="wishop-shipping-toolbar"
      style={{ top: position.top, left: position.left }}
    >
      <div
        className="wishop-shipping-header"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <div className="wishop-shipping-title">
          <strong>微店管家发货助手</strong>
          <span className="wishop-shipping-status">{activeSession.status} · 拖动标题可调整位置</span>
        </div>
        <button
          type="button"
          className="wishop-shipping-icon-button"
          onClick={() => setCollapsed(true)}
          title="暂时隐藏"
        >
          -
        </button>
      </div>
      <div className="wishop-shipping-grid">
        <div className="wishop-shipping-card">
          <label>微信订单</label>
          <p title={activeSession.order.title}>{activeSession.order.title}</p>
          <small>订单号：{activeSession.orderId}</small>
          <small>实付：{formatPrice(activeSession.order.orderPrice)} · 数量：x{activeSession.order.quantity}</small>
          <small>预估手续费：{formatPrice(activeSession.order.estimatedCommissionFee)}</small>
          <small>下单：{formatTime(activeSession.order.createTime)} · 支付：{formatTime(activeSession.order.payTime)}</small>
        </div>
        {purchaseAssociationVisible && (
          <div className="wishop-shipping-card">
            <label>淘宝采购关联</label>
            <p>{activeSession.purchaseAssociationMessage || '等待淘宝付款完成'}</p>
            {activeSession.linkedPlatformOrderId && <small>淘宝订单号：{activeSession.linkedPlatformOrderId}</small>}
            <small>状态：{formatPurchaseAssociationStatus(activeSession.purchaseAssociationStatus)}</small>
          </div>
        )}
        <div className="wishop-shipping-card">
          <label>SKU / 规格</label>
          <p title={skuText(activeSession)}>{skuText(activeSession)}</p>
          {activeSession.order.skuCode && <small>编码：{activeSession.order.skuCode}</small>}
        </div>
        {isCheckoutPage && (
          <div className="wishop-shipping-card">
            <label>利润预估</label>
            <p className={estimatedProfit !== undefined && estimatedProfit < 0 ? 'wishop-shipping-profit-value wishop-shipping-profit-value--negative' : 'wishop-shipping-profit-value'}>
              利润 {formatPrice(estimatedProfit)} · 利润率 {formatRate(estimatedProfitRate)}
            </p>
            <small>微信实付：{formatPrice(orderPrice)} · 手续费：{formatPrice(commissionFee)}</small>
            <small>淘宝应付：{purchaseCost !== undefined ? formatPrice(purchaseCost) : snapshot.checkoutPayAmountText || '未读取到'}</small>
          </div>
        )}
        <div className="wishop-shipping-card">
          <label>真实收货信息</label>
          <p title={addressText(address)}>
            {addressText(address) || '未获取真实地址，点击下方按钮会消耗今日额度'}
          </p>
          {fetchedAt && <small>获取时间：{fetchedAt}</small>}
          <div className={isCheckoutPage ? 'wishop-shipping-inline-actions' : 'wishop-shipping-inline-actions wishop-shipping-inline-actions--single'}>
            <button
              type="button"
              className="wishop-shipping-inline-primary"
              onClick={() => fetchRealAddress(Boolean(address))}
              disabled={addressLoading}
            >
              {addressLoading ? (address ? '刷新中...' : '获取中...') : (address ? '刷新真实地址' : '获取真实地址')}
            </button>
            {isCheckoutPage && (
              <button
                type="button"
                className="wishop-shipping-inline-primary"
                onClick={() => setCheckoutAddressDebugVisible(visible => !visible)}
              >
                {checkoutAddressDebugVisible ? '隐藏地址结构' : '查看地址结构'}
              </button>
            )}
          </div>
        </div>
        {isCheckoutPage && checkoutAddressDebugVisible && (
          <div className="wishop-shipping-card">
            <label>淘宝填充地址结构</label>
            {checkoutAddressPreview ? (
              <>
                <small>地区：{checkoutAddressPreview.divisions.map(item => `${item.label}=${item.value}`).join(' / ') || '-'}</small>
                <small>详细地址：{checkoutAddressPreview.detail || '-'}</small>
                <small>收货人：{checkoutAddressPreview.name || '-'}</small>
                <small>手机号：{checkoutAddressPreview.phone || '-'}</small>
                {checkoutAddressPreview.warnings.length > 0 && (
                  <small>提示：{checkoutAddressPreview.warnings.join('；')}</small>
                )}
              </>
            ) : (
              <small>暂无地址，先获取真实地址后可查看结构化结果</small>
            )}
          </div>
        )}
        <div className="wishop-shipping-card">
          <label>备注</label>
          <small>{activeSession.order.customerNotes?.trim() ? `买家：${activeSession.order.customerNotes}` : '买家：无'}</small>
          <small>{activeSession.order.merchantNotes?.trim() ? `商家：${activeSession.order.merchantNotes}` : '商家：无'}</small>
          <small>{activeSession.source.remark?.trim() ? `货源：${activeSession.source.remark}` : '货源：无'}</small>
        </div>
      </div>
      <div className="wishop-shipping-actions">
        <button type="button" onClick={copyOrderInfo}>复制订单</button>
        <button type="button" onClick={copySku}>复制SKU</button>
        <button type="button" onClick={copyAddress}>复制地址</button>
        <button type="button" onClick={copyNotes}>复制备注</button>
        {isCheckoutPage && (
          <button type="button" onClick={handleFillCheckoutAddress} disabled={addressFilling}>
            {addressFilling ? '填充中...' : '填充地址'}
          </button>
        )}
        <button type="button" onClick={refreshSnapshot}>重读页面</button>
      </div>
      {notice && <div className="wishop-shipping-notice">{notice}</div>}
    </section>
  );
};
