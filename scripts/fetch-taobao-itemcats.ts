import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const DEFAULT_API_URL = 'https://eco.taobao.com/router/rest';
const DEFAULT_OUTPUT_PATH = 'data/category-snapshots/taobao-itemcats.json';
const ITEMCAT_FIELDS = 'cid,parent_cid,name,is_parent,status,sort_order';

export interface RawTaobaoItemCat {
  cid?: string | number;
  parent_cid?: string | number;
  name?: string;
  is_parent?: boolean | string | number;
  status?: string;
  sort_order?: string | number;
}

export interface NormalizedTaobaoItemCat {
  cid: string;
  parentCid: string;
  name: string;
  isParent: boolean;
  status?: string;
  sortOrder?: number;
}

export interface TaobaoItemCatRecord extends NormalizedTaobaoItemCat {
  level: number;
  path: string[];
}

export interface TaobaoItemCatSnapshot {
  source: 'taobao.itemcats.get';
  fetchedAt: string;
  rootParentCid: string;
  total: number;
  categories: TaobaoItemCatRecord[];
}

interface TopClientOptions {
  appKey: string;
  appSecret: string;
  session: string;
  apiUrl?: string;
  fetcher?: typeof fetch;
}

interface FetchQueueItem {
  parentCid: string;
  parentPath: string[];
  level: number;
}

function normalizeString(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = normalizeString(value).toLowerCase();
  return text === 'true' || text === '1' || text === 'yes';
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = normalizeString(value);
  if (!text || !Number.isFinite(Number(text))) return undefined;
  return Number(text);
}

/**
 * 淘宝 TOP 的 MD5 签名规则：
 * secret + 按参数名排序后的 key/value 串 + secret，然后取大写 MD5。
 *
 * 注意这里不接收 access token，也不会输出 appSecret。脚本日志里只打印进度。
 */
export function signTopRequestMd5(params: Record<string, string>, appSecret: string): string {
  const base = appSecret
    + Object.keys(params)
      .filter(key => key !== 'sign' && params[key] !== undefined)
      .sort()
      .map(key => `${key}${params[key]}`)
      .join('')
    + appSecret;
  return createHash('md5').update(base, 'utf8').digest('hex').toUpperCase();
}

export function normalizeTaobaoItemCat(raw: RawTaobaoItemCat): NormalizedTaobaoItemCat {
  const cid = normalizeString(raw.cid);
  const parentCid = normalizeString(raw.parent_cid);
  const name = normalizeString(raw.name);
  if (!cid || !name) {
    throw new Error('淘宝类目接口返回了缺少 cid/name 的类目记录');
  }

  const status = normalizeString(raw.status);
  const sortOrder = normalizeNumber(raw.sort_order);
  return {
    cid,
    parentCid,
    name,
    isParent: normalizeBoolean(raw.is_parent),
    ...(status ? { status } : {}),
    ...(sortOrder === undefined ? {} : { sortOrder }),
  };
}

export function parseTaobaoItemcatsResponse(payload: unknown): RawTaobaoItemCat[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const errorResponse = record.error_response;
  if (errorResponse && typeof errorResponse === 'object') {
    const errorRecord = errorResponse as Record<string, unknown>;
    const code = normalizeString(errorRecord.code);
    const message = normalizeString(errorRecord.sub_msg) || normalizeString(errorRecord.msg) || '淘宝类目接口返回错误';
    throw new Error(code ? `淘宝类目接口错误 ${code}: ${message}` : message);
  }

  const response = record.itemcats_get_response as Record<string, unknown> | undefined;
  const itemCats = response?.item_cats as Record<string, unknown> | undefined;
  const rawItems = itemCats?.item_cat;
  if (Array.isArray(rawItems)) return rawItems as RawTaobaoItemCat[];
  if (rawItems && typeof rawItems === 'object') return [rawItems as RawTaobaoItemCat];
  return [];
}

export async function fetchTaobaoItemCatChildren(
  parentCid: string,
  options: TopClientOptions,
): Promise<RawTaobaoItemCat[]> {
  const timestamp = formatTopTimestamp(new Date());
  const params: Record<string, string> = {
    method: 'taobao.itemcats.get',
    app_key: options.appKey,
    timestamp,
    format: 'json',
    v: '2.0',
    sign_method: 'md5',
    session: options.session,
    fields: ITEMCAT_FIELDS,
    parent_cid: parentCid,
  };
  const signedParams = {
    ...params,
    sign: signTopRequestMd5(params, options.appSecret),
  };
  const body = new URLSearchParams(signedParams);
  const fetcher = options.fetcher || fetch;
  const response = await fetcher(options.apiUrl || DEFAULT_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`淘宝类目接口 HTTP ${response.status}`);
  }
  return parseTaobaoItemcatsResponse(await response.json());
}

export async function fetchAllTaobaoItemcats(
  fetchChildren: (parentCid: string) => Promise<RawTaobaoItemCat[]>,
  rootParentCid = '0',
): Promise<TaobaoItemCatRecord[]> {
  const queue: FetchQueueItem[] = [{ parentCid: rootParentCid, parentPath: [], level: 0 }];
  const visitedParents = new Set<string>();
  const seenCategories = new Set<string>();
  const records: TaobaoItemCatRecord[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visitedParents.has(current.parentCid)) continue;
    visitedParents.add(current.parentCid);

    const children = await fetchChildren(current.parentCid);
    for (const rawChild of children) {
      const child = normalizeTaobaoItemCat(rawChild);
      if (seenCategories.has(child.cid)) continue;
      seenCategories.add(child.cid);

      const path = [...current.parentPath, child.name];
      const record: TaobaoItemCatRecord = {
        ...child,
        level: current.level + 1,
        path,
      };
      records.push(record);

      if (child.isParent) {
        queue.push({
          parentCid: child.cid,
          parentPath: path,
          level: record.level,
        });
      }
    }
  }

  return records;
}

export function createTaobaoItemCatSnapshot(
  categories: TaobaoItemCatRecord[],
  rootParentCid = '0',
  fetchedAt = new Date().toISOString(),
): TaobaoItemCatSnapshot {
  return {
    source: 'taobao.itemcats.get',
    fetchedAt,
    rootParentCid,
    total: categories.length,
    categories,
  };
}

export function formatTopTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    ' ',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
    ':',
    pad(date.getSeconds()),
  ].join('');
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

function readOutputPath(): string {
  const fromFlag = process.argv.find(arg => arg.startsWith('--out='));
  const rawPath = fromFlag?.slice('--out='.length)
    || process.env.TAOBAO_ITEMCATS_OUTPUT
    || DEFAULT_OUTPUT_PATH;
  return resolve(process.cwd(), rawPath);
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(resolve(entry)).href);
}

async function runCli(): Promise<void> {
  const outputPath = readOutputPath();
  const options: TopClientOptions = {
    appKey: readRequiredEnv('TAOBAO_APP_KEY'),
    appSecret: readRequiredEnv('TAOBAO_APP_SECRET'),
    session: readRequiredEnv('TAOBAO_SESSION'),
    apiUrl: process.env.TAOBAO_API_URL?.trim() || DEFAULT_API_URL,
  };

  console.log('开始获取淘宝标准商品类目...');
  const categories = await fetchAllTaobaoItemcats(parentCid => fetchTaobaoItemCatChildren(parentCid, options));
  const snapshot = createTaobaoItemCatSnapshot(categories);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`淘宝类目快照已保存：${outputPath}`);
  console.log(`类目数量：${snapshot.total}`);
}

if (isDirectExecution()) {
  runCli().catch(error => {
    const message = error instanceof Error ? error.message : '获取淘宝类目失败';
    console.error(message);
    process.exitCode = 1;
  });
}
