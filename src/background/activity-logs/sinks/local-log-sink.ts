import type { ActivityLogEntry } from '../../../shared/activity-log';
import { appendActivityLog } from '../activity-log-store.ts';

export async function writeLocalActivityLog(entry: ActivityLogEntry): Promise<void> {
  await appendActivityLog(entry);
}
