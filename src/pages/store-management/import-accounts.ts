export interface AccountImportDraft {
  row: number;
  name: string;
  appId: string;
  appSecret: string;
}

export interface AccountImportSkip {
  row: number;
  name?: string;
  appId?: string;
  reason: string;
}

export interface AccountImportParseResult {
  accounts: AccountImportDraft[];
  skipped: AccountImportSkip[];
}

type AccountImportInput = {
  name?: unknown;
  appId?: unknown;
  appSecret?: unknown;
};

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeImportPayload(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray((value as { accounts?: unknown }).accounts)) {
    return (value as { accounts: unknown[] }).accounts;
  }
  throw new Error('JSON 必须是店铺数组，或包含 accounts 数组');
}

export function parseAccountImportJson(text: string, existingAppIds: Iterable<string>): AccountImportParseResult {
  const payload = normalizeImportPayload(JSON.parse(text));
  const seenAppIds = new Set(Array.from(existingAppIds, appId => appId.trim()).filter(Boolean));
  const accounts: AccountImportDraft[] = [];
  const skipped: AccountImportSkip[] = [];

  payload.forEach((item, index) => {
    const row = index + 1;
    if (!item || typeof item !== 'object') {
      skipped.push({ row, reason: '不是有效对象' });
      return;
    }

    const source = item as AccountImportInput;
    const name = readString(source.name);
    const appId = readString(source.appId);
    const appSecret = readString(source.appSecret);

    if (!name || !appId || !appSecret) {
      skipped.push({ row, name, appId, reason: '缺少 name、appId 或 appSecret' });
      return;
    }

    if (seenAppIds.has(appId)) {
      skipped.push({ row, name, appId, reason: 'AppID 已存在' });
      return;
    }

    seenAppIds.add(appId);
    accounts.push({ row, name, appId, appSecret });
  });

  return { accounts, skipped };
}
