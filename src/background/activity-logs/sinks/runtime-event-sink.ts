import type { ActivityLogEntry } from '../../../shared/activity-log';

export async function emitActivityLogAdded(entry: ActivityLogEntry): Promise<void> {
  await chrome.runtime.sendMessage({ type: 'event', event: 'activityLog:added', payload: entry });
}
