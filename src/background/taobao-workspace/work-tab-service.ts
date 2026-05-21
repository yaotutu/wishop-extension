let workTabId: number | undefined;

async function getExistingWorkTab(): Promise<chrome.tabs.Tab | null> {
  if (workTabId === undefined) return null;
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find(item => item.id === workTabId);
  if (tab) return tab;
  workTabId = undefined;
  return null;
}

export async function openTaobaoWorkTab(url: string): Promise<chrome.tabs.Tab> {
  const existing = await getExistingWorkTab();
  if (existing?.id !== undefined) {
    return chrome.tabs.update(existing.id, { url, active: false });
  }
  const tab = await chrome.tabs.create({ url, active: false });
  workTabId = tab.id;
  return tab;
}

export async function activateTaobaoWorkTab(): Promise<void> {
  const tab = await getExistingWorkTab();
  if (!tab?.id) return;
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId !== undefined) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
}

export function isTaobaoWorkTab(tabId: number): boolean {
  return workTabId === tabId;
}

export function installTaobaoWorkTabCleanup(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (workTabId === tabId) workTabId = undefined;
  });
}
