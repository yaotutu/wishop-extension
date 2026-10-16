import type { LinkSource } from './types.ts';
import type { PurchaseLinkSettings } from './settings.ts';

// 比较两个来源的优先级：返回负数表示 candidate 更高，正数表示 existing 更高，0 表示同级。
// 索引越小优先级越高。数组里找不到的来源视为最低优先级（防御性，正常经过归一化不会出现）。
export function compareLinkPriority(settings: PurchaseLinkSettings, candidate: LinkSource, existing: LinkSource): number {
  const order = settings.sourceOrder;
  const candidateIndex = order.indexOf(candidate);
  const existingIndex = order.indexOf(existing);
  const safeCandidate = candidateIndex === -1 ? Number.MAX_SAFE_INTEGER : candidateIndex;
  const safeExisting = existingIndex === -1 ? Number.MAX_SAFE_INTEGER : existingIndex;
  return safeCandidate - safeExisting;
}

// manual 是用户明确操作，永远可写，不受 enabled 开关控制。
export function isSourceEnabled(settings: PurchaseLinkSettings, source: LinkSource): boolean {
  if (source === 'manual') return true;
  return settings.enabledSources.includes(source);
}
