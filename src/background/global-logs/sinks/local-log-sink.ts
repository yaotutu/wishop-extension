import type { GlobalLogEntry } from '../../../shared/global-log';
import { appendGlobalLog } from '../global-log-store';

export async function writeLocalGlobalLog(entry: GlobalLogEntry): Promise<void> {
  await appendGlobalLog(entry);
}
