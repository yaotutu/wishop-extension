import type { TaobaoPurchaseOrderSnapshot } from '../../../shared/types';
import { exactElementTextMatches, normalizeText, pageText, valueAfterLabel } from '../dom/text';

const ORDER_STATUS_CANDIDATES = [
  '交易关闭',
  '卖家已发货',
  '买家已付款',
  '交易成功',
  '等待买家付款',
  '退款中',
  '退款成功',
  '已签收',
];

const LOGISTICS_STATUS_CANDIDATES = ['包裹正在等待揽收', '已揽收', '运输中', '派送中', '已签收', '等待揽收', '包裹已出库'];

const LOGISTICS_COMPANIES = ['顺丰', '中通', '圆通', '申通', '韵达', '极兔', '邮政', 'EMS', '京东', '德邦', '菜鸟'];

interface LogisticsPackageInfo {
  logisticsCompany: string;
  trackingNumber: string;
}

function textContent(root?: ParentNode | Element | null): string {
  return normalizeText(root?.textContent || '');
}

function findFirstElementText(root: ParentNode, predicate: (text: string) => boolean): string {
  const elements = Array.from(root.querySelectorAll('*'));
  for (const element of elements) {
    const text = textContent(element);
    if (text && predicate(text)) return text;
  }
  return '';
}

function readStatus(text: string): string {
  const statusRoot = document.querySelector('#headerContainer') || document.querySelector('#headerP1Container') || document.body;
  const exact = exactElementTextMatches(ORDER_STATUS_CANDIDATES, statusRoot);
  if (exact) return exact;
  return ORDER_STATUS_CANDIDATES.find(item => text.includes(item)) || '';
}

function readTrackingNumber(text: string): string {
  const labelled = valueAfterLabel(text, ['运单号码', '运单号', '快递单号', '物流单号', '包裹单号']);
  if (labelled) return labelled;
  return readLogisticsPackageInfo().trackingNumber;
}

function readLogisticsCompany(text: string): string {
  const labelled = valueAfterLabel(text, ['物流公司', '快递公司', '承运公司']);
  if (labelled) return labelled;
  const packageInfo = readLogisticsPackageInfo();
  if (packageInfo.logisticsCompany) return packageInfo.logisticsCompany;
  return LOGISTICS_COMPANIES.find(company => text.includes(company)) || '';
}

function readLogisticsStatus(text: string): string {
  const labelled = valueAfterLabel(text, ['物流状态', '包裹状态', '配送状态']);
  if (labelled) return labelled;
  const statusRoot = document.querySelector('#headerContainer') || document.querySelector('#headerP1Container') || document.body;
  const logisticsLine = findFirstElementText(statusRoot, item => item.includes('查看物流详情') && item.includes('包裹'));
  const detailMatch = logisticsLine.match(/已发货\s*(.+?)\s*查看物流详情/);
  if (detailMatch?.[1]) return detailMatch[1].trim();
  return LOGISTICS_STATUS_CANDIDATES.find(item => text.includes(item)) || '';
}

function parseLogisticsPackageText(text: string): LogisticsPackageInfo {
  const match = text.match(/包裹\d+\s*\(共\d+件\)\s*([^\s]+?(?:速递|快递|物流|快运|邮政|EMS|顺丰|中通|圆通|申通|韵达|极兔|京东|德邦|菜鸟))\s+([A-Z0-9]{8,})/i);
  return {
    logisticsCompany: match?.[1]?.trim() || '',
    trackingNumber: match?.[2]?.trim() || '',
  };
}

function readLogisticsPackageInfo(): LogisticsPackageInfo {
  const packageHeader = document.querySelector('#leftMainContentContainer [class^="logisticsPackageHeader--"]');
  if (packageHeader) {
    const logisticsCompany = textContent(packageHeader.querySelector('[class^="logisticsPackageEXTxt--"]'));
    const trackingNumber = textContent(packageHeader.querySelector('[class^="logisticsPackageNo--"]'));
    if (logisticsCompany || trackingNumber) return { logisticsCompany, trackingNumber };
  }

  const packageText = findFirstElementText(
    document.body,
    item => item.includes('包裹') && /[A-Z0-9]{8,}/i.test(item) && LOGISTICS_COMPANIES.some(company => item.includes(company)),
  );
  return parseLogisticsPackageText(packageText || pageText());
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
