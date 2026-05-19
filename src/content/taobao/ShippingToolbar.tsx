import React, { useCallback, useEffect, useState } from 'react';
import type { OrderAddressInfo, ShippingSession } from '../../shared/types';
import { extensionApi } from '../../shared/extension-api';
import { formatOrderAddressForCopy } from '../../shared/address-format';
import { readTaobaoPageSnapshot, type TaobaoPageSnapshot } from './page-adapter';

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

export const ShippingToolbar: React.FC<Props> = ({ session }) => {
  const [snapshot, setSnapshot] = useState<TaobaoPageSnapshot>(() => readTaobaoPageSnapshot());
  const [notice, setNotice] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [address, setAddress] = useState<OrderAddressInfo | undefined>(session.order.address);
  const [addressLoading, setAddressLoading] = useState(false);

  useEffect(() => {
    void extensionApi.shipping.markPageReady(session.id).catch(() => {});
  }, [session.id]);

  const refreshSnapshot = useCallback(() => {
    setSnapshot(readTaobaoPageSnapshot());
    setNotice('已重新读取页面');
  }, []);

  const copyOrderInfo = useCallback(async () => {
    const lines = [
      `订单号：${session.orderId}`,
      `商品：${session.order.title}`,
      `规格：${skuText(session)}`,
      `数量：${session.order.quantity}`,
      `实付：${formatPrice(session.order.orderPrice)}`,
      `下单：${formatTime(session.order.createTime)}`,
      `支付：${formatTime(session.order.payTime)}`,
      noteText('买家备注', session.order.customerNotes),
      noteText('商家备注', session.order.merchantNotes),
      addressText(address) ? `地址：${addressText(address).replace('\n', ' ')}` : '',
      session.source.remark ? `货源备注：${session.source.remark}` : '',
    ].filter(Boolean);
    await copyText(lines.join('\n'));
    setNotice('订单信息已复制');
  }, [address, session]);

  const copyAddress = useCallback(async () => {
    const text = addressText(address);
    if (!text) {
      setNotice('当前会话没有地址信息');
      return;
    }
    await copyText(text);
    setNotice('地址已复制');
  }, [address]);

  const fetchRealAddress = useCallback(async () => {
    setAddressLoading(true);
    try {
      const decoded = await extensionApi.orders.decodeAddress(session.accountId, session.orderId);
      setAddress(decoded);
      setNotice('真实地址已获取，本次已消耗地址查看额度');
    } catch (err) {
      setNotice(`获取真实地址失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setAddressLoading(false);
    }
  }, [session.accountId, session.orderId]);

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
      <section className="wishop-shipping-toolbar wishop-shipping-toolbar--collapsed">
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

  return (
    <section className="wishop-shipping-toolbar">
      <div className="wishop-shipping-header">
        <div className="wishop-shipping-title">
          <strong>微店管家发货助手</strong>
          <span className="wishop-shipping-status">{session.status}</span>
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
        </div>
        <div className="wishop-shipping-card">
          <label>备注</label>
          <small>{session.order.customerNotes?.trim() ? `买家：${session.order.customerNotes}` : '买家：无'}</small>
          <small>{session.order.merchantNotes?.trim() ? `商家：${session.order.merchantNotes}` : '商家：无'}</small>
          <small>{session.source.remark?.trim() ? `货源：${session.source.remark}` : '货源：无'}</small>
        </div>
        <div className="wishop-shipping-card">
          <label>当前淘宝页</label>
          <p title={snapshot.title || '未识别标题'}>{snapshot.title || '未识别标题'}</p>
          <small>{snapshot.priceText || snapshot.selectedSkuText || '页面信息待确认'}</small>
        </div>
      </div>
      <div className="wishop-shipping-actions">
        <button type="button" onClick={copyOrderInfo}>复制订单</button>
        <button type="button" onClick={copySku}>复制SKU</button>
        <button type="button" onClick={copyAddress}>复制地址</button>
        {!address && (
          <button type="button" onClick={fetchRealAddress} disabled={addressLoading}>
            {addressLoading ? '获取中...' : '获取真实地址'}
          </button>
        )}
        <button type="button" onClick={copyNotes}>复制备注</button>
        <button type="button" onClick={refreshSnapshot}>重读页面</button>
      </div>
      {notice && <div className="wishop-shipping-notice">{notice}</div>}
    </section>
  );
};
