import type { Order, ScheduledJob } from '../../shared/types';
import { OrderStatus } from '../../shared/types';
import type { ShipmentCheckSettings } from '../../shared/settings';
import { MAX_SHIPMENT_CHECK_ORDER_LOOKBACK_DAYS, normalizeShipmentCheckSettings } from '../../shared/settings';
import { getActivePurchaseLookupKeys, openPurchaseLookupSessionTab } from '../purchase-lookup/purchase-lookup-session-service';
import { getOrderAssociations, updateLinkedOrderShipmentCheck } from '../store/order-association-repository';
import { addScheduledJob, getScheduledJobs, updateScheduledJob } from '../store/scheduled-job-repository';
import { getAppSettings } from '../store/settings-repository';
import { getClient } from '../wxshop/client-registry';
import { registerScheduledJobExecutor } from './scheduler-center';
import {
  buildShipmentCheckDispatchPlan,
  selectShipmentCheckCandidates,
  type ShipmentCheckCandidate,
  type ShipmentCheckDispatchPlanItem,
} from './order-shipment-check-planner';

const DISPATCH_ALARM_PREFIX = 'orders-shipment-check:';
const DEFAULT_ORDER_SHIPMENT_JOB_NAME = '采购发货状态检测';

function encodeAlarmPart(value: string): string {
  return encodeURIComponent(value);
}

function decodeAlarmPart(value: string): string {
  return decodeURIComponent(value);
}

function dispatchAlarmName(candidate: ShipmentCheckCandidate): string {
  return `${DISPATCH_ALARM_PREFIX}${[
    candidate.accountId,
    candidate.orderId,
    candidate.platformOrderId,
  ].map(encodeAlarmPart).join(':')}`;
}

function parseDispatchAlarmName(name: string): ShipmentCheckCandidate | null {
  if (!name.startsWith(DISPATCH_ALARM_PREFIX)) return null;
  const parts = name.slice(DISPATCH_ALARM_PREFIX.length).split(':');
  if (parts.length !== 3) return null;
  const [accountId, orderId, platformOrderId] = parts.map(decodeAlarmPart);
  if (!accountId || !orderId || !platformOrderId) return null;
  return { accountId, orderId, platformOrderId };
}

async function fetchPendingShipmentOrders(accountId: string): Promise<Order[]> {
  const settings = (await getAppSettings()).shipmentCheck;
  const api = await getClient(accountId);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const lookbackDays = Math.min(settings.orderLookbackDays, MAX_SHIPMENT_CHECK_ORDER_LOOKBACK_DAYS);
  const createTimeRange = {
    start_time: nowSeconds - lookbackDays * 24 * 60 * 60,
    end_time: nowSeconds,
  };
  const listResult = await api.getOrderList({
    page_size: 50,
    status: OrderStatus.PendingShipment,
    create_time_range: createTimeRange,
  });

  const settled = await Promise.allSettled(listResult.order_id_list.map(orderId => api.getOrderDetail(orderId)));
  return settled
    .map(result => result.status === 'fulfilled' ? result.value : null)
    .filter((order): order is Order => order !== null);
}

async function scheduleDispatches(plan: ShipmentCheckDispatchPlanItem[], settings: ShipmentCheckSettings): Promise<void> {
  for (const item of plan) {
    await chrome.alarms.create(dispatchAlarmName(item), { when: item.scheduledAt });
    await updateLinkedOrderShipmentCheck(item.accountId, item.orderId, {
      lastShipmentCheckQueuedAt: Date.now(),
      lastShipmentCheckStatus: 'queued',
      lastShipmentCheckError: '',
      nextShipmentCheckAfter: item.scheduledAt + settings.normalCooldownMinutes * 60 * 1000,
    });
  }
}

async function dispatchShipmentCheck(candidate: ShipmentCheckCandidate): Promise<void> {
  const settings = (await getAppSettings()).shipmentCheck;
  if (!settings.enabled) {
    await updateLinkedOrderShipmentCheck(candidate.accountId, candidate.orderId, {
      lastShipmentCheckFinishedAt: Date.now(),
      lastShipmentCheckStatus: 'skipped',
      lastShipmentCheckError: '发货状态检测已关闭',
    });
    return;
  }

  await updateLinkedOrderShipmentCheck(candidate.accountId, candidate.orderId, {
    lastShipmentCheckStartedAt: Date.now(),
    lastShipmentCheckStatus: 'running',
    lastShipmentCheckError: '',
  });

  try {
    await openPurchaseLookupSessionTab(candidate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateLinkedOrderShipmentCheck(candidate.accountId, candidate.orderId, {
      lastShipmentCheckFinishedAt: Date.now(),
      lastShipmentCheckStatus: 'failed',
      lastShipmentCheckError: message,
      nextShipmentCheckAfter: Date.now() + settings.failureCooldownMinutes * 60 * 1000,
    });
  }
}

export async function ensureOrderShipmentCheckScheduledJob(): Promise<ScheduledJob | null> {
  const settings = (await getAppSettings()).shipmentCheck;
  const cronExpression = `*/${settings.windowMinutes} * * * *`;
  const jobs = await getScheduledJobs();
  const existing = jobs.find(job => job.jobType === 'orders.checkShipmentStatus' && job.scope === 'global');
  if (existing) {
    const patch: Partial<ScheduledJob> = {};
    if (existing.cronExpression !== cronExpression) patch.cronExpression = cronExpression;
    if (existing.enabled !== settings.enabled) patch.enabled = settings.enabled;
    if (Object.keys(patch).length > 0) {
      const updatedAt = Date.now();
      await updateScheduledJob(existing.id, patch);
      return { ...existing, ...patch, updatedAt };
    }
    return existing;
  }
  return addScheduledJob({
    name: DEFAULT_ORDER_SHIPMENT_JOB_NAME,
    enabled: settings.enabled,
    module: 'orders',
    jobType: 'orders.checkShipmentStatus',
    scope: 'global',
    cronExpression,
    staggerMinutes: 0,
    dailyLimit: 0,
    payload: {},
  });
}

export function registerOrderShipmentScheduledJobs(): void {
  registerScheduledJobExecutor('orders.checkShipmentStatus', async ({ accountId }) => {
    if (!accountId) throw new Error('缺少账号 ID');
    const settings = normalizeShipmentCheckSettings((await getAppSettings()).shipmentCheck);
    if (!settings.enabled) {
      return { listed: 0, status: 'skipped' as const, error: '发货状态检测已关闭' };
    }

    const [orders, associations] = await Promise.all([
      fetchPendingShipmentOrders(accountId),
      getOrderAssociations(accountId),
    ]);
    const associationsByOrderId = Object.fromEntries(associations.map(association => [association.orderId, association]));
    const candidates = selectShipmentCheckCandidates({
      accountId,
      orders,
      associationsByOrderId,
      settings,
      now: Date.now(),
      activeKeys: getActivePurchaseLookupKeys(),
    });
    const plan = buildShipmentCheckDispatchPlan({ candidates, settings, now: Date.now() });
    await scheduleDispatches(plan, settings);

    return {
      listed: plan.length,
      status: plan.length > 0 ? 'completed' as const : 'skipped' as const,
      error: plan.length > 0 ? `已安排 ${plan.length} 个采购单在本窗口内检测` : '本轮没有需要检测的采购单',
    };
  });
}

export function installOrderShipmentCheckDispatchListener(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    const candidate = parseDispatchAlarmName(alarm.name);
    if (!candidate) return;
    void dispatchShipmentCheck(candidate);
  });
}
