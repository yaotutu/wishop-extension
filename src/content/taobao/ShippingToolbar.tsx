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

function clampPosition(position: ShippingToolbarPosition, width = 380): ShippingToolbarPosition {
  const maxLeft = Math.max(8, window.innerWidth - Math.min(width, window.innerWidth - 16) - 8);
  const maxTop = Math.max(8, window.innerHeight - 80);
  return {
    top: Math.min(Math.max(8, position.top), maxTop),
    left: Math.min(Math.max(8, position.left), maxLeft),
  };
}

export const ShippingToolbar: React.FC<Props> = ({ session }) => {
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
    void hydrateToolbarState().then(() => {
      const current = useShippingToolbarStore.getState().position;
      setPosition(clampPosition(current), false);
    }).catch(() => {});
  }, [hydrateToolbarState, setPosition]);

  useEffect(() => {
    void extensionApi.shipping.markPageReady(session.id).catch(() => {});
  }, [session.id]);

  useEffect(() => {
    extensionApi.orderRealAddresses.get(session.accountId, session.orderId)
      .then(cache => setAddressCache(cache))
      .catch(() => {});
  }, [session.accountId, session.orderId]);

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
    const timer = window.setInterval(() => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      const nextSnapshot = readTaobaoPageSnapshot();
      setSnapshot(nextSnapshot);
      setCheckoutAddressDebugVisible(false);
      if (nextSnapshot.pageType !== 'checkout') {
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
    const address = addressCache?.address || session.order.address;
    const lines = [
      `订单号：${session.orderId}`,
      `商品：${session.order.title}`,
      `规格：${skuText(session)}`,
      `数量：${session.order.quantity}`,
      `实付：${formatPrice(session.order.orderPrice)}`,
      `预估手续费：${formatPrice(session.order.estimatedCommissionFee)}`,
      `下单：${formatTime(session.order.createTime)}`,
      `支付：${formatTime(session.order.payTime)}`,
      noteText('买家备注', session.order.customerNotes),
      noteText('商家备注', session.order.merchantNotes),
      addressText(address) ? `地址：${addressText(address).replace('\n', ' ')}` : '',
      session.source.remark ? `货源备注：${session.source.remark}` : '',
    ].filter(Boolean);
    await copyText(lines.join('\n'));
    setNotice('订单信息已复制');
  }, [addressCache, session]);

  const copyAddress = useCallback(async () => {
    const address = addressCache?.address || session.order.address;
    const text = addressText(address);
    if (!text) {
      setNotice('当前会话没有地址信息');
      return;
    }
    await copyText(text);
    setNotice('地址已复制');
  }, [addressCache, session.order.address]);

  const fetchRealAddress = useCallback(async (forceRefresh = false) => {
    setAddressLoading(true);
    try {
      const cache = forceRefresh
        ? await extensionApi.orderRealAddresses.refresh(session.accountId, session.orderId)
        : await extensionApi.orderRealAddresses.fetch(session.accountId, session.orderId);
      setAddressCache(cache);
      setNotice('');
    } catch (err) {
      setNotice(`获取真实地址失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setAddressLoading(false);
    }
  }, [session.accountId, session.orderId]);

  const handleFillCheckoutAddress = useCallback(async () => {
    setAddressFilling(true);
    try {
      const address = addressCache?.address
        || session.order.address
        || (await extensionApi.orderRealAddresses.fetch(session.accountId, session.orderId)).address;
      const result = await fillTaobaoCheckoutAddress(address);
      if (result.filledFields.length > 0) {
        setNotice(`已填充：${result.filledFields.join('、')}${result.warnings.length ? `；${result.warnings.join('；')}` : ''}`);
      } else {
        setNotice(result.warnings.join('；') || '未能填充地址');
      }
      if (!addressCache?.address) {
        void extensionApi.orderRealAddresses.get(session.accountId, session.orderId)
          .then(cache => setAddressCache(cache))
          .catch(() => {});
      }
    } catch (err) {
      setNotice(`填充地址失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setAddressFilling(false);
    }
  }, [addressCache?.address, session.accountId, session.order.address, session.orderId]);

  const copySku = useCallback(async () => {
    await copyText(skuText(session));
    setNotice('SKU 已复制');
  }, [session]);

  const copyNotes = useCallback(async () => {
    const text = [
      noteText('买家备注', session.order.customerNotes),
      noteText('商家备注', session.order.merchantNotes),
      noteText('货源备注', session.source.remark),
    ].filter(Boolean).join('\n');
    if (!text) {
      setNotice('当前没有备注');
      return;
    }
    await copyText(text);
    setNotice('备注已复制');
  }, [session]);

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

  const address = addressCache?.address || session.order.address;
  const fetchedAt = formatFetchedAt(addressCache?.fetchedAt);
  const isCheckoutPage = snapshot.pageType === 'checkout';
  const checkoutAddressPreview = isCheckoutPage && address
    ? normalizeCheckoutAddress(address)
    : null;

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
          <span className="wishop-shipping-status">{session.status} · 拖动标题可调整位置</span>
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
          <p title={session.order.title}>{session.order.title}</p>
          <small>订单号：{session.orderId}</small>
          <small>实付：{formatPrice(session.order.orderPrice)} · 数量：x{session.order.quantity}</small>
          <small>预估手续费：{formatPrice(session.order.estimatedCommissionFee)}</small>
          <small>下单：{formatTime(session.order.createTime)} · 支付：{formatTime(session.order.payTime)}</small>
        </div>
        <div className="wishop-shipping-card">
          <label>SKU / 规格</label>
          <p title={skuText(session)}>{skuText(session)}</p>
          {session.order.skuCode && <small>编码：{session.order.skuCode}</small>}
        </div>
        <div className="wishop-shipping-card">
          <label>真实收货信息</label>
          <p title={addressText(address)}>
            {addressText(address) || '未获取真实地址，点击下方按钮会消耗今日额度'}
          </p>
          {fetchedAt && <small>获取时间：{fetchedAt}</small>}
          {!address && (
            <button
              type="button"
              className="wishop-shipping-inline-primary"
              onClick={() => fetchRealAddress(false)}
              disabled={addressLoading}
            >
              {addressLoading ? '获取中...' : '获取真实地址'}
            </button>
          )}
          {(address || isCheckoutPage) && (
            <div className="wishop-shipping-inline-actions">
              {address && (
                <button
                  type="button"
                  className="wishop-shipping-inline-primary"
                  onClick={() => fetchRealAddress(true)}
                  disabled={addressLoading}
                >
                  {addressLoading ? '刷新中...' : '刷新真实地址'}
                </button>
              )}
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
          )}
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
          <small>{session.order.customerNotes?.trim() ? `买家：${session.order.customerNotes}` : '买家：无'}</small>
          <small>{session.order.merchantNotes?.trim() ? `商家：${session.order.merchantNotes}` : '商家：无'}</small>
          <small>{session.source.remark?.trim() ? `货源：${session.source.remark}` : '货源：无'}</small>
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
