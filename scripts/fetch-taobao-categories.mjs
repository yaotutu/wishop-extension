import { execFileSync } from 'node:child_process';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 从 WXT 启动的 Chrome profile 中读取淘宝开放平台登录态，并调用开放平台文档工具的类目接口。
 *
 * 这个脚本刻意不接入正式 TOP API，也不要求 app_key/app_secret。它复用本机浏览器已经登录的
 * open.taobao.com/taobao.com Cookie，只做一次性类目数据导出，适合快速生成本项目后续匹配用的
 * 淘宝类目基础数据。
 */

const PROJECT_ROOT = process.cwd();
const COOKIE_DB = path.join(PROJECT_ROOT, '.wxt/chrome-profile/Default/Cookies');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'data');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'taobao-categories.json');
const OUTPUT_CSV = path.join(OUTPUT_DIR, 'taobao-categories.csv');
const OPEN_TAOBAO_API_DOC_URL = 'https://open.taobao.com/api.htm?docId=122&docType=2';
const CATEGORY_ENDPOINT = 'https://open.taobao.com/handler/tools/getItemProps.json?isEn=false';

function ensureCookieDbExists() {
  if (!existsSync(COOKIE_DB)) {
    throw new Error(`未找到 WXT Chrome Cookie 数据库：${COOKIE_DB}`);
  }
}

function runText(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim();
}

function getChromeCookiePassword() {
  return runText('security', ['find-generic-password', '-w', '-s', 'Chrome Safe Storage', '-a', 'Chrome']);
}

function getMacChromeCookieKey() {
  const password = getChromeCookiePassword();
  return pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
}

function decryptMacChromeCookie(encryptedHex, key) {
  const encrypted = Buffer.from(encryptedHex, 'hex');
  if (encrypted.length === 0) return '';
  if (!encrypted.subarray(0, 3).equals(Buffer.from('v10'))) {
    throw new Error('遇到未知的 Chrome Cookie 加密格式，当前脚本只处理 v10 AES-CBC 格式');
  }

  const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '));
  const decrypted = Buffer.concat([
    decipher.update(encrypted.subarray(3)),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function readCandidateCookies() {
  const sql = [
    'select host_key, name, value, hex(encrypted_value), path, is_secure',
    'from cookies',
    "where host_key like '%taobao.com%'",
    "or host_key like '%tmall.com%'",
    "or host_key like '%alibaba.com%'",
    'order by host_key, name;',
  ].join(' ');
  const output = runText('sqlite3', [COOKIE_DB, sql]);
  if (!output) return [];

  const key = getMacChromeCookieKey();
  return output.split('\n').map(line => {
    const [hostKey, name, plainValue, encryptedHex, cookiePath, isSecure] = line.split('|');
    const value = plainValue || decryptMacChromeCookie(encryptedHex || '', key);
    return {
      hostKey,
      name,
      value,
      path: cookiePath || '/',
      secure: isSecure === '1',
    };
  }).filter(cookie => cookie.name && cookie.value);
}

function domainMatches(host, cookieHost) {
  const normalizedHost = host.toLowerCase();
  const normalizedCookieHost = cookieHost.toLowerCase().replace(/^\./, '');
  return normalizedHost === normalizedCookieHost || normalizedHost.endsWith(`.${normalizedCookieHost}`);
}

function cookieHeaderFor(url, cookies) {
  const parsed = new URL(url);
  return cookies
    .filter(cookie => domainMatches(parsed.hostname, cookie.hostKey))
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

async function fetchTextWithCookies(url, cookies) {
  const response = await fetch(url, {
    headers: {
      cookie: cookieHeaderFor(url, cookies),
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    },
    redirect: 'follow',
  });
  return await response.text();
}

function extractTbToken(html) {
  const matched = html.match(/name=['"]_tb_token_['"][^>]*value=['"]([^'"]+)['"]/i)
    || html.match(/value=['"]([^'"]+)['"][^>]*name=['"]_tb_token_['"]/i);
  return matched?.[1] || '';
}

async function fetchChildren({ parentCid, token, cookies }) {
  const body = new URLSearchParams({
    _tb_token_: token,
    cid: String(parentCid),
    act: 'childCid',
  });

  const response = await fetch(CATEGORY_ENDPOINT, {
    method: 'POST',
    headers: {
      cookie: cookieHeaderFor(CATEGORY_ENDPOINT, cookies),
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      referer: OPEN_TAOBAO_API_DOC_URL,
      origin: 'https://open.taobao.com',
      'x-requested-with': 'XMLHttpRequest',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    },
    body,
  });
  const payload = await response.json();

  if (payload.code === 'need_login') {
    throw new Error('开放平台接口返回 need_login：请确认 WXT Chrome 里的 open.taobao.com 已登录');
  }
  if (payload.code === 'token_invalid') {
    throw new Error('开放平台接口返回 token_invalid：请刷新 open.taobao.com 文档页后重试');
  }
  if (!payload.success && !Array.isArray(payload.data)) {
    throw new Error(payload.msg || payload.errMsg || `读取类目 ${parentCid} 失败`);
  }
  return Array.isArray(payload.data) ? payload.data : [];
}

function normalizeCategory(raw, parent) {
  const cid = String(raw.cid ?? raw.category_id ?? raw.id ?? '').trim();
  const name = String(raw.name ?? raw.category_name ?? '').trim();
  const isParent = Boolean(raw.isParent ?? raw.is_parent ?? raw.parent);
  const level = parent.level + 1;
  const pathIds = [...parent.pathIds, cid];
  const pathNames = [...parent.pathNames, name];

  return {
    cid,
    name,
    parentCid: String(parent.cid),
    level,
    isParent,
    pathIds,
    pathNames,
    path: pathNames.join(' / '),
    raw,
  };
}

function toCsvValue(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function writeOutputs(rows) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_JSON, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');

  const csv = [
    ['cid', 'name', 'parentCid', 'level', 'isParent', 'path'].map(toCsvValue).join(','),
    ...rows.map(row => [
      row.cid,
      row.name,
      row.parentCid,
      row.level,
      row.isParent,
      row.path,
    ].map(toCsvValue).join(',')),
  ].join('\n');
  writeFileSync(OUTPUT_CSV, `${csv}\n`, 'utf8');
}

async function main() {
  ensureCookieDbExists();

  const cookies = readCandidateCookies();
  if (cookies.length === 0) {
    throw new Error('WXT Chrome profile 中没有找到淘宝相关 Cookie，请先在该浏览器里登录淘宝开放平台');
  }

  const html = await fetchTextWithCookies(OPEN_TAOBAO_API_DOC_URL, cookies);
  const token = extractTbToken(html);
  if (!token) {
    throw new Error('没有从开放平台文档页读取到 _tb_token_，请先在 WXT Chrome 里打开并登录开放平台文档页');
  }

  const rows = [];
  const queue = [{ cid: 0, level: 0, pathIds: [], pathNames: [] }];
  const seen = new Set();

  while (queue.length > 0) {
    const parent = queue.shift();
    const children = await fetchChildren({ parentCid: parent.cid, token, cookies });

    for (const raw of children) {
      const category = normalizeCategory(raw, parent);
      if (!category.cid || seen.has(category.cid)) continue;
      seen.add(category.cid);
      rows.push(category);

      if (category.isParent) {
        queue.push({
          cid: category.cid,
          level: category.level,
          pathIds: category.pathIds,
          pathNames: category.pathNames,
        });
      }
    }

    if (rows.length > 0 && rows.length % 200 === 0) {
      console.log(`已读取 ${rows.length} 个类目，待递归父类目 ${queue.length} 个`);
    }
  }

  writeOutputs(rows);
  console.log(`完成：共读取 ${rows.length} 个淘宝类目`);
  console.log(`JSON：${OUTPUT_JSON}`);
  console.log(`CSV：${OUTPUT_CSV}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
