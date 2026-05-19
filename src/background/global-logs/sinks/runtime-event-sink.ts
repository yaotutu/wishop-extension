import type { GlobalLogEntry } from '../../../shared/global-log';

export async function emitGlobalLogAdded(entry: GlobalLogEntry): Promise<void> {
  await chrome.runtime.sendMessage({ type: 'event', event: 'globalLog:added', payload: entry });
}
