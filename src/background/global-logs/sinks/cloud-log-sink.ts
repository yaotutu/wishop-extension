import type { GlobalLogEntry } from '../../../shared/global-log';

export async function enqueueCloudGlobalLog(_entry: GlobalLogEntry): Promise<void> {
  // Reserved for future cloud analytics upload. Upload failures must never block business tasks.
}
