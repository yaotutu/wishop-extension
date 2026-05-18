import type {
  BlacklistRule,
  Config,
  DraftProduct,
  LogEntry,
  Order,
  OrderAddressInfo,
  OrderListParams,
  OrderSearchParams,
  OrderStatus,
  ScheduledTask,
  StatusRule,
  TaskConfig,
  TaskCycleResult,
  ViolationMatch,
  ViolationScanResult,
} from '../shared/types';
import {
  addAccount,
  addScheduler,
  clearLogs,
  createScopedAddLog,
  getAccount,
  getAccounts,
  getActiveAccountId,
  getBlacklistRules,
  getConfig,
  getDefaultBlacklistCodes,
  getDefaultStatusRules,
  getLogs,
  getSchedulers,
  getSkipKeywords,
  getStatusRules,
  getTaskConfig,
  getViolationWords,
  removeAccount,
  removeScheduler,
  setActiveAccountId,
  setBlacklistRules,
  setConfig,
  setSkipKeywords,
  setStatusRules,
  setTaskConfig,
  setViolationWords,
  updateAccount,
  updateScheduler,
} from './store';
import { removeClient } from './wxshop/client-registry';
import { createWxShopClient } from './wxshop/client';
import { getClient } from './wxshop/client-registry';
import { runTaskCycle } from './modules/task-cycle';
import { batchDeleteViolations, batchScan, scanOneByOne } from './modules/violation-detect';
import { createLogger } from './utils/logger';
import { SessionManager } from './utils/session-manager';
import { isSupportedCron, startTask, stopAllTasks, stopTask } from './scheduler/listing-scheduler';

interface PaginationState {
  nextKey: string;
  hasMore: boolean;
}

interface OrderPaginationState {
  nextKey: string;
  hasMore: boolean;
  timeRange?: { start_time: number; end_time: number };
}

interface ScanSessionState {
  generator: AsyncGenerator<ViolationMatch & { scanned: number }> | null;
  current: (ViolationMatch & { scanned: number }) | null;
  done: boolean;
}

type RuntimeRequest = {
  channel: string;
  args: unknown[];
};

const draftPaginationMap = new Map<string, PaginationState>();
const orderPaginationMap = new Map<string, OrderPaginationState>();
const taskSessions = new SessionManager<void>();
const scanSessions = new SessionManager<ScanSessionState>();

function makeTimeRange(): { start_time: number; end_time: number } {
  const now = Math.floor(Date.now() / 1000);
  return { start_time: now - 7 * 24 * 3600, end_time: now };
}

async function handleMessage(channel: string, args: unknown[]): Promise<unknown> {
  switch (channel) {
    case 'accounts:list':
      return getAccounts();
    case 'accounts:add':
      return addAccount(args[0] as string, args[1] as Config);
    case 'accounts:remove': {
      const accountId = args[0] as string;
      await stopAllTasks();
      await removeAccount(accountId);
      removeClient(accountId);
      draftPaginationMap.delete(accountId);
      return undefined;
    }
    case 'accounts:update':
      return updateAccount(args[0] as string, args[1] as Partial<{ name: string; config: Config }>);
    case 'accounts:getActive':
      return getActiveAccountId();
    case 'accounts:setActive':
      return setActiveAccountId(args[0] as string);

    case 'config:get':
      return getConfig(args[0] as string);
    case 'config:set': {
      const [accountId, config] = args as [string, Config];
      await setConfig(accountId, config);
      removeClient(accountId);
      try {
        await createWxShopClient(config).getAccessToken();
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }

    case 'drafts:fetch':
      return fetchDrafts(args[0] as string, args[1] as boolean | undefined);
    case 'drafts:list':
      return listDraft(args[0] as string, args[1] as string);

    case 'orders:list':
      return listOrders(args[0] as string, args[1] as OrderStatus | undefined, args[2] as number | undefined);
    case 'orders:detail':
      return (await getClient(args[0] as string)).getOrderDetail(args[1] as string);
    case 'orders:search':
      return searchOrders(args[0] as string, args[1] as OrderSearchParams);
    case 'orders:decodeAddress':
      return (await getClient(args[0] as string)).decodeOrderSensitiveInfo(args[1] as string);

    case 'quota:get':
      return (await getClient(args[0] as string)).getAuditQuota();

    case 'logs:get':
      return getLogs(args[0] as string);
    case 'logs:clear':
      return clearLogs(args[0] as string);

    case 'scheduler:list':
      return getSchedulers(args[0] as string);
    case 'scheduler:add': {
      const [accountId, task] = args as [string, Omit<ScheduledTask, 'id' | 'lastRunDate' | 'todayListedCount'>];
      const newTask = await addScheduler(accountId, task);
      if (newTask.enabled) {
        const ok = await startTask(accountId, newTask);
        if (!ok) throw new Error(`当前插件定时器不支持该 cron 表达式: ${newTask.cronExpression}。请改为 */N * * * *、M * * * * 或 M H * * *。`);
      }
      return newTask;
    }
    case 'scheduler:update': {
      const [accountId, taskId, patch] = args as [string, string, Partial<ScheduledTask>];
      if (patch.cronExpression && !isSupportedCron(patch.cronExpression)) {
        throw new Error(`当前插件定时器不支持该 cron 表达式: ${patch.cronExpression}。请改为 */N * * * *、M * * * * 或 M H * * *。`);
      }
      await updateScheduler(accountId, taskId, patch);
      const task = (await getSchedulers(accountId)).find(item => item.id === taskId);
      if (patch.enabled === false) await stopTask(accountId, taskId);
      else if (task?.enabled) await startTask(accountId, task);
      return undefined;
    }
    case 'scheduler:remove':
      await stopTask(args[0] as string, args[1] as string);
      return removeScheduler(args[0] as string, args[1] as string);

    case 'taskConfig:get':
      return getTaskConfig(args[0] as string);
    case 'taskConfig:set':
      return setTaskConfig(args[0] as string, args[1] as TaskConfig);
    case 'task:run':
      return runTask(args[0] as string, args[1] as TaskConfig);
    case 'task:stop':
      taskSessions.stop(args[0] as string);
      return undefined;

    case 'violation:getWords':
      return getViolationWords(args[0] as string);
    case 'violation:setWords':
      return setViolationWords(args[0] as string, args[1] as string[]);
    case 'violation:batchScan':
      return runViolationBatchScan(args[0] as string, args[1] as number | undefined);
    case 'violation:scanStep':
      return runViolationStep(args[0] as string, args[1] as 'next' | 'skip' | 'delete');
    case 'violation:batchDelete':
      return batchDeleteViolations(await getClient(args[0] as string), createScopedAddLog(args[0] as string), args[1] as ViolationMatch[], Date.now().toString(), args[0] as string);
    case 'violation:stop':
      scanSessions.stop(args[0] as string);
      return undefined;

    case 'blacklistRules:get':
      return getBlacklistRules();
    case 'blacklistRules:getDefaultCodes':
      return getDefaultBlacklistCodes();
    case 'blacklistRules:set':
      return setBlacklistRules(args[0] as BlacklistRule[]);
    case 'skipKeywords:get':
      return getSkipKeywords();
    case 'skipKeywords:set':
      return setSkipKeywords(args[0] as string[]);
    case 'statusRules:get':
      return getStatusRules();
    case 'statusRules:set':
      return setStatusRules(args[0] as StatusRule[]);
    case 'statusRules:reset': {
      const defaults = getDefaultStatusRules();
      await setStatusRules(defaults);
      return defaults;
    }

    case 'app:version':
      return chrome.runtime.getManifest().version;

    default:
      throw new Error(`Unknown runtime channel: ${channel}`);
  }
}

async function fetchDrafts(accountId: string, reset?: boolean): Promise<{ products: DraftProduct[]; hasMore: boolean }> {
  const logger = createLogger('Drafts', accountId);
  let pagination = draftPaginationMap.get(accountId);
  if (!pagination || reset) {
    pagination = { nextKey: '', hasMore: true };
    draftPaginationMap.set(accountId, pagination);
  }
  if (!pagination.hasMore) return { products: [], hasMore: false };

  const api = await getClient(accountId);
  const products: DraftProduct[] = [];
  let nextKey = pagination.nextKey;

  while (products.length < 10) {
    const result = await api.getDraftProducts(30, nextKey);
    for (const productId of result.productIds) {
      if (products.length >= 10) break;
      try {
        const detail = await api.getProductDetail(productId);
        if (detail.editStatus === 72) products.push(detail);
      } catch (error) {
        logger.error(`获取商品 ${productId} 详情失败:`, error);
      }
    }
    nextKey = result.nextKey;
    if (!result.hasMore || !nextKey) {
      pagination.hasMore = false;
      break;
    }
  }

  pagination.nextKey = nextKey;
  return { products, hasMore: pagination.hasMore };
}

async function listDraft(accountId: string, productId: string): Promise<{ success: boolean; error?: string }> {
  const logger = createLogger('Drafts', accountId);
  const addLog = createScopedAddLog(accountId);
  try {
    const result = await (await getClient(accountId)).listProduct(productId);
    if (result.errcode === 0) {
      addLog({ runId: '', productId, productTitle: '', action: 'list', status: 'success' });
      return { success: true };
    }
    addLog({ runId: '', productId, productTitle: '', action: 'list', status: 'failed', errorCode: result.errcode, errorMsg: result.errmsg });
    return { success: false, error: result.errmsg };
  } catch (error: any) {
    logger.error(`上架商品 ${productId} 失败:`, error);
    addLog({ runId: '', productId, productTitle: '', action: 'list', status: 'failed', errorMsg: error.message });
    return { success: false, error: error.message };
  }
}

async function listOrders(accountId: string, status?: OrderStatus, pageSize?: number): Promise<{ orders: Order[]; hasMore: boolean }> {
  const logger = createLogger('Orders', accountId);
  const key = `${accountId}:${status ?? 'all'}`;
  let pag = orderPaginationMap.get(key);
  if (!pag) {
    pag = { nextKey: '', hasMore: true, timeRange: makeTimeRange() };
    orderPaginationMap.set(key, pag);
  }
  if (!pag.hasMore) return { orders: [], hasMore: false };

  const api = await getClient(accountId);
  const params: OrderListParams = {
    page_size: pageSize || 10,
    next_key: pag.nextKey || undefined,
    status,
    update_time_range: pag.timeRange,
  };
  const listResult = await api.getOrderList(params);
  const settled = await Promise.allSettled(listResult.order_id_list.map(orderId => api.getOrderDetail(orderId)));
  const orders = settled
    .map((result, index) => {
      if (result.status === 'fulfilled') return result.value;
      logger.error(`获取订单 ${listResult.order_id_list[index]} 详情失败:`, result.reason);
      return null;
    })
    .filter((order): order is Order => order !== null);

  pag.nextKey = listResult.next_key;
  pag.hasMore = listResult.has_more;
  return { orders, hasMore: pag.hasMore };
}

async function searchOrders(accountId: string, params: OrderSearchParams): Promise<{ orders: Order[]; hasMore: boolean }> {
  const logger = createLogger('Orders', accountId);
  const api = await getClient(accountId);
  const listResult = await api.searchOrders(params);
  const settled = await Promise.allSettled(listResult.order_id_list.map(orderId => api.getOrderDetail(orderId)));
  const orders = settled
    .map((result, index) => {
      if (result.status === 'fulfilled') return result.value;
      logger.error(`获取订单 ${listResult.order_id_list[index]} 详情失败:`, result.reason);
      return null;
    })
    .filter((order): order is Order => order !== null);
  return { orders, hasMore: listResult.has_more };
}

async function runTask(accountId: string, taskConfig: TaskConfig): Promise<TaskCycleResult> {
  const logger = createLogger('TaskRun', accountId);
  const runId = Date.now().toString();
  const addLog = createScopedAddLog(accountId);

  if (taskConfig.listUnreviewed) {
    try {
      const quota = await (await getClient(accountId)).getAuditQuota();
      logger.info(`配额检查: 剩余 ${quota.quota} / 总共 ${quota.total}`);
      addLog({ runId, productId: '', productTitle: `今日提审配额: 剩余${quota.quota}/${quota.total}`, action: 'check', status: quota.quota > 0 ? 'success' : 'failed' });
    } catch (error: any) {
      addLog({ runId, productId: '', productTitle: '', action: 'check', status: 'failed', errorMsg: `配额检查失败: ${error.message}` });
      logger.error('配额检查失败:', error);
      return { scanned: 0, deleted: 0, listed: 0, errors: 0, skipped: 0, stopped: true, reason: `配额检查失败: ${error.message}` };
    }
  }

  const signal = taskSessions.start(accountId, undefined);
  try {
    return await runTaskCycle(
      await getClient(accountId),
      addLog,
      taskConfig,
      runId,
      signal,
      accountId,
      await getBlacklistRules(),
      await getSkipKeywords(),
      await getStatusRules(),
    );
  } finally {
    taskSessions.complete(accountId);
  }
}

async function runViolationBatchScan(accountId: string, limit?: number): Promise<ViolationScanResult> {
  const logger = createLogger('Violation', accountId);
  const words = await getViolationWords(accountId);
  const account = await getAccount(accountId);
  const api = await getClient(accountId);
  logger.info(`批量扫描开始 店铺=${account?.name || '未知'} appId=${api.config.appId} 词库=${words.length}个 上限=${limit || '全部'}`);
  if (words.length === 0) return { scanned: 0, violations: [], errors: 0, stopped: false, reason: '词库为空' };

  const signal = scanSessions.start(accountId, { generator: null, current: null, done: false });
  try {
    return await batchScan(api, createScopedAddLog(accountId), words, Date.now().toString(), signal, limit, accountId);
  } finally {
    scanSessions.complete(accountId);
  }
}

async function runViolationStep(accountId: string, action: 'next' | 'skip' | 'delete'): Promise<unknown> {
  const logger = createLogger('Violation', accountId);
  let session = scanSessions.get(accountId);
  if (!session || session.state.done) {
    const words = await getViolationWords(accountId);
    if (words.length === 0) return { type: 'done', reason: '词库为空' };
    const api = await getClient(accountId);
    const account = await getAccount(accountId);
    logger.info(`逐个扫描开始 店铺=${account?.name || '未知'} appId=${api.config.appId} 词库=${words.length}个`);
    const signal = scanSessions.start(accountId, { generator: null, current: null, done: false });
    session = scanSessions.get(accountId)!;
    session.state.generator = scanOneByOne(api, createScopedAddLog(accountId), words, Date.now().toString(), signal, accountId);
  }

  if (action === 'delete' && session.state.current) {
    const result = await batchDeleteViolations(await getClient(accountId), createScopedAddLog(accountId), [session.state.current], Date.now().toString(), accountId);
    if (result.stopped) {
      session.state.done = true;
      scanSessions.stop(accountId);
      return { type: 'stopped', reason: '删除触发全局限制' };
    }
  }

  const next = await session.state.generator!.next();
  if (next.done) {
    session.state.done = true;
    scanSessions.complete(accountId);
    return { type: 'done', scanned: session.state.current?.scanned || 0 };
  }
  session.state.current = next.value;
  return { type: 'violation', ...next.value };
}

export function installRuntimeHandlers(): void {
  chrome.runtime.onMessage.addListener((request: RuntimeRequest, _sender, sendResponse) => {
    if (!request?.channel) return false;
    handleMessage(request.channel, request.args || [])
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  });
}
