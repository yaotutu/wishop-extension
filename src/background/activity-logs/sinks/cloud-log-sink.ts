import type { ActivityLogEntry } from '../../../shared/activity-log';

export async function enqueueCloudActivityLog(_entry: ActivityLogEntry): Promise<void> {
  // Reserved for future cloud analytics upload. Upload failures must never block business tasks.
}
