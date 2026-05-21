import type { TaobaoPurchaseOrderSnapshot } from '../../../shared/types';
import { exactElementTextMatches, pageText, valueAfterLabel } from '../dom/text';

function readStatus(text: string): string {
  const candidates = [
    '买家已付款',
    '卖家已发货',
    '交易成功',
    '交易关闭',
    '等待买家付款',
    '退款中',
    '退款成功',
    '已签收',
  ];
  const exact = exactElementTextMatches(candidates);
  if (exact) return exact;
  return candidates.find(item => text.includes(item)) || '';
}

function readTrackingNumber(text: string): string {
  const labelled = valueAfterLabel(text, ['运单号码', '运单号', '快递单号', '物流单号', '包裹单号']);
  if (labelled) return labelled;
  return '';
}

function readLogisticsCompany(text: string): string {
  const labelled = valueAfterLabel(text, ['物流公司', '快递公司', '承运公司']);
  if (labelled) return labelled;
  const commonCompanies = ['顺丰', '中通', '圆通', '申通', '韵达', '极兔', '邮政', 'EMS', '京东', '德邦', '菜鸟'];
  return commonCompanies.find(company => text.includes(company)) || '';
}

function readLogisticsStatus(text: string): string {
  const labelled = valueAfterLabel(text, ['物流状态', '包裹状态', '配送状态']);
  if (labelled) return labelled;
  const candidates = ['已揽收', '运输中', '派送中', '已签收', '等待揽收', '包裹已出库'];
  return candidates.find(item => text.includes(item)) || '';
}

export function readTaobaoPurchaseOrderSnapshot(expectedOrderId: string): TaobaoPurchaseOrderSnapshot {
  const text = pageText();
  const urlOrderId = new URL(location.href).searchParams.get('biz_order_id') || '';
  const platformOrderId = expectedOrderId || urlOrderId || valueAfterLabel(text, ['订单编号', '订单号']);
  const platformOrderStatus = readStatus(text);
  const logisticsStatus = readLogisticsStatus(text);
  const logisticsCompany = readLogisticsCompany(text);
  const trackingNumber = readTrackingNumber(text);

  return {
    platformOrderId,
    platformOrderStatus,
    logisticsStatus,
    logisticsCompany,
    trackingNumber,
    remark: location.href,
  };
}

export function isPurchaseOrderSnapshotUseful(snapshot: TaobaoPurchaseOrderSnapshot): boolean {
  return Boolean(
    snapshot.platformOrderStatus ||
    snapshot.logisticsStatus ||
    snapshot.logisticsCompany ||
    snapshot.trackingNumber,
  );
}
