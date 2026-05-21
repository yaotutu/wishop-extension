import type { TaobaoWorkspaceRole } from '../../shared/types';

const TAOBAO_TASK_HOME_URL = 'https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm';
const TAOBAO_SHIPPING_HOME_URL = 'https://www.taobao.com/';

const workspaceTabIds: Partial<Record<TaobaoWorkspaceRole, number>> = {};

async function getExistingWorkTab(role: TaobaoWorkspaceRole): Promise<chrome.tabs.Tab | null> {
  const tabId = workspaceTabIds[role];
  if (tabId === undefined) return null;
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find(item => item.id === tabId);
  if (tab) return tab;
  workspaceTabIds[role] = undefined;
  return null;
}

async function openWorkspaceTab(role: TaobaoWorkspaceRole, url: string, active: boolean): Promise<chrome.tabs.Tab> {
  const existing = await getExistingWorkTab(role);
  if (existing?.id !== undefined) {
    const tab = await chrome.tabs.update(existing.id, { url, active });
    if (active && tab.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return tab;
  }
  const tab = await chrome.tabs.create({ url, active });
  workspaceTabIds[role] = tab.id;
  return tab;
}

export async function openTaobaoShippingWorkTab(url: string): Promise<chrome.tabs.Tab> {
  return openWorkspaceTab('shipping', url, true);
}

export async function ensureTaobaoShippingWorkTab(): Promise<chrome.tabs.Tab> {
  return openWorkspaceTab('shipping', TAOBAO_SHIPPING_HOME_URL, false);
}

export async function ensureTaobaoTaskWorkTab(): Promise<chrome.tabs.Tab> {
  return openWorkspaceTab('background-task', TAOBAO_TASK_HOME_URL, false);
}

export async function openTaobaoWorkTab(url: string): Promise<chrome.tabs.Tab> {
  return openWorkspaceTab('background-task', url, false);
}

export async function activateTaobaoWorkTab(): Promise<void> {
  const tab = await getExistingWorkTab('background-task');
  if (!tab?.id) return;
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId !== undefined) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
}

export function isTaobaoWorkTab(tabId: number): boolean {
  return workspaceTabIds.shipping === tabId || workspaceTabIds['background-task'] === tabId;
}

export function getTaobaoWorkspaceRoleByTabId(tabId: number): TaobaoWorkspaceRole | null {
  if (workspaceTabIds.shipping === tabId) return 'shipping';
  if (workspaceTabIds['background-task'] === tabId) return 'background-task';
  return null;
}

export function installTaobaoWorkTabCleanup(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (workspaceTabIds.shipping === tabId) workspaceTabIds.shipping = undefined;
    if (workspaceTabIds['background-task'] === tabId) workspaceTabIds['background-task'] = undefined;
  });
}
