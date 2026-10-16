import { v4 as uuidv4 } from 'uuid';
import type { LinkSource, LinkedPlatformOrder, OrderAssociation, Order } from '../../shared/types';
import { compareLinkPriority, isSourceEnabled } from '../../shared/purchase-link-priority.ts';
import { extractTaobaoOrderIdFromMerchantNotes } from '../../shared/taobao-order-id-extractor.ts';
import { getAppSettings } from '../store/settings-repository.ts';
import { getOrderAssociations, setOrderAssociation } from '../store/order-association-repository.ts';
import { recordActivity } from '../activity-logs/activity-log-service.ts';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';

// applyLinkedOrder 的候选关联。调用方只负责提供「从哪来、订单号是什么、带上哪些已读到的状态」，
// 是否真的写入由优先级表决定，调用方不需要关心覆盖策略。
export interface LinkedOrderCandidate {
  accountId: string;
  orderId: string;
  platformOrderId: string;
  linkSource: LinkSource;
  // 以下是来源读到的可选状态字段，没读到就留空，后续由发货状态读取补全。
  platformOrderStatus?: string;
  logisticsStatus?: string;
  logisticsCompany?: string;
  trackingNumber?: string;
  remark?: string;
}

export type ApplyLinkedOrderOutcome =
  | { written: true; association: OrderAssociation; replaced: LinkSource | null }
  | { written: false; reason: 'disabled' | 'lower_priority'; existing: LinkSource | null };

const logger = createDiagnosticLogger({ domain: 'orders', component: 'OrderAssociation' });


// 把候选对象和已有关联合并成一个 LinkedPlatformOrder。
// 已读到的状态字段（物流、单号）优先保留已有值，只有当候选显式带了新值才覆盖。
function buildLinkedOrder(existing: LinkedPlatformOrder | undefined, candidate: LinkedOrderCandidate, now: number): LinkedPlatformOrder {
  const remark = candidate.remark?.trim() || existing?.remark;
  return {
    id: existing?.id || uuidv4(),
    platform: 'taobao',
    platformOrderId: candidate.platformOrderId.trim(),
    platformOrderStatus: candidate.platformOrderStatus?.trim() || existing?.platformOrderStatus || '',
    logisticsStatus: candidate.logisticsStatus?.trim() || existing?.logisticsStatus || '',
    linkSource: candidate.linkSource,
    logisticsCompany: candidate.logisticsCompany?.trim() || existing?.logisticsCompany || '',
    trackingNumber: candidate.trackingNumber?.trim() || existing?.trackingNumber || '',
    remark,
    lastShipmentCheckQueuedAt: existing?.lastShipmentCheckQueuedAt,
    lastShipmentCheckStartedAt: existing?.lastShipmentCheckStartedAt,
    lastShipmentCheckFinishedAt: existing?.lastShipmentCheckFinishedAt,
    lastShipmentCheckStatus: existing?.lastShipmentCheckStatus,
    lastShipmentCheckError: existing?.lastShipmentCheckError,
    nextShipmentCheckAfter: existing?.nextShipmentCheckAfter,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

// 统一的关联写入入口。所有来源（付款抓取、手填、备注提取、未来新来源）都必须走这里。
// 决策规则：未启用的自动来源直接跳过；候选优先级 >= 已有则覆盖写入，否则跳过。
export async function applyLinkedOrder(candidate: LinkedOrderCandidate): Promise<ApplyLinkedOrderOutcome> {
  const trimmedOrderId = candidate.platformOrderId.trim();
  if (!trimmedOrderId) {
    return { written: false, reason: 'disabled', existing: null };
  }

  const settings = (await getAppSettings()).purchaseLink;
  if (!isSourceEnabled(settings, candidate.linkSource)) {
    logger.info('关联来源未启用，跳过写入', {
      orderId: candidate.orderId,
      linkSource: candidate.linkSource,
    });
    return { written: false, reason: 'disabled', existing: null };
  }

  const existing = (await getOrderAssociations(candidate.accountId)).find(item => item.orderId === candidate.orderId);
  const existingLinked = existing?.linkedOrders[0];
  const existingSource = existingLinked?.linkSource ?? null;

  if (existingSource !== null && compareLinkPriority(settings, candidate.linkSource, existingSource) > 0) {
    // 候选优先级低于已有来源，跳过，不覆盖用户或更高优先级来源建立的关联。
    logger.info('关联来源优先级低于已有关联，跳过写入', {
      orderId: candidate.orderId,
      candidateSource: candidate.linkSource,
      existingSource,
    });
    return { written: false, reason: 'lower_priority', existing: existingSource };
  }

  const now = Date.now();
  const linkedOrder = buildLinkedOrder(existingLinked, candidate, now);
  const association = await setOrderAssociation(candidate.accountId, candidate.orderId, {
    internalRemark: existing?.internalRemark || '',
    linkedOrders: [linkedOrder],
  });

  const replaced = existingSource && existingSource !== candidate.linkSource ? existingSource : null;
  if (replaced) {
    // 来源被覆盖时写一条用户可见的活动日志，让用户事后能查到关联是怎么变的。
    void recordActivity({
      domain: 'orders',
      event: 'completed',
      level: 'info',
      title: '采购订单关联已更新',
      detail: `${sourceLabel(candidate.linkSource)}覆盖了原有的${sourceLabel(existingSource as LinkSource)}关联：${trimmedOrderId}`,
      scope: 'account',
      accountId: candidate.accountId,
      trigger: 'background',
      metadata: { orderId: candidate.orderId, linkSource: candidate.linkSource, replacedSource: replaced },
    }).catch(() => {});
  }

  return { written: true, association, replaced };
}

const SOURCE_LABELS: Record<LinkSource, string> = {
  manual: '手动输入',
  merchant_notes: '卖家备注',
  payment_success: '付款页抓取',
};

function sourceLabel(source: LinkSource): string {
  return SOURCE_LABELS[source] || source;
}


// 同步后对一批订单跑备注提取，命中且来源启用/优先级够高就写入关联。
// 只处理「未关联 或 已有低优先级关联」的订单，避免对用户手动关联的订单做无意义扫描。
export async function linkOrdersFromMerchantNotes(
  accountId: string,
  orders: Order[],
): Promise<{ scanned: number; linked: number }> {
  const settings = (await getAppSettings()).purchaseLink;
  if (!isSourceEnabled(settings, 'merchant_notes')) {
    return { scanned: 0, linked: 0 };
  }

  let linked = 0;
  let scanned = 0;
  for (const order of orders) {
    const existing = (await getOrderAssociations(accountId)).find(item => item.orderId === order.order_id);
    const existingSource = existing?.linkedOrders[0]?.linkSource ?? null;
    // 已有关联且优先级高于备注来源，跳过，不重复扫描写入。
    if (existingSource && compareLinkPriority(settings, 'merchant_notes', existingSource) > 0) continue;

    const platformOrderId = extractTaobaoOrderIdFromMerchantNotes(order);
    if (!platformOrderId) continue;
    scanned += 1;

    const outcome = await applyLinkedOrder({
      accountId,
      orderId: order.order_id,
      platformOrderId,
      linkSource: 'merchant_notes',
      remark: '卖家备注提取',
    });
    if (outcome.written) linked += 1;
  }
  return { scanned, linked };
}
