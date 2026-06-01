import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 通过已登录的淘宝开放平台页面抓取全量淘宝类目。
 *
 * 运行逻辑：
 * 1. 本机启动一个只监听 127.0.0.1 的接收器。
 * 2. 生成一段可粘贴到 Chrome JavaScript Console 的页面脚本。
 * 3. 页面脚本在 open.taobao.com 的登录上下文里递归请求类目接口。
 * 4. 页面脚本把结果 POST 回本机接收器，接收器写出 JSON 和 CSV。
 *
 * 这条路径不需要淘宝开放平台 app_key/app_secret，也不会把浏览器 Cookie 打印到终端。
 */

const PROJECT_ROOT = process.cwd();
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'data');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'taobao-categories.json');
const OUTPUT_CSV = path.join(OUTPUT_DIR, 'taobao-categories.csv');
const HOST = '127.0.0.1';
const PORT = Number(process.env.TAOBAO_CATEGORY_RECEIVER_PORT || 32177);

function toCsvValue(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function writeOutputs(payload) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_JSON, `${JSON.stringify({
    fetchedAt: payload.fetchedAt,
    sourceUrl: payload.sourceUrl,
    count: rows.length,
    rows,
  }, null, 2)}\n`, 'utf8');

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
  return rows.length;
}

function browserSnippet() {
  return `void (async () => {
  const receiverUrl = 'http://${HOST}:${PORT}/taobao-categories';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const token = document.querySelector('input[name="_tb_token_"]')?.value || '';
  if (!token) throw new Error('没有找到 _tb_token_，请刷新淘宝开放平台文档页后重试');

  const rows = [];
  const queue = [{ cid: 0, level: 0, pathIds: [], pathNames: [] }];
  const seen = new Set();

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

  async function fetchChildren(parentCid) {
    const body = new URLSearchParams({
      _tb_token_: token,
      cid: String(parentCid),
      act: 'childCid',
    });
    const response = await fetch('/handler/tools/getItemProps.json?isEn=false', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest',
      },
      body,
    });
    const payload = await response.json();
    if (payload.code === 'need_login') throw new Error('开放平台接口要求登录，请先登录 open.taobao.com');
    if (payload.code === 'token_invalid') throw new Error('开放平台 token 失效，请刷新页面后重试');
    if (!payload.success && !Array.isArray(payload.data)) {
      throw new Error(payload.msg || payload.errMsg || '读取类目失败：' + parentCid);
    }
    return Array.isArray(payload.data) ? payload.data : [];
  }

  while (queue.length > 0) {
    const parent = queue.shift();
    const children = await fetchChildren(parent.cid);
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
      console.log('[wishop] 已读取', rows.length, '个类目，待处理父类目', queue.length);
      document.title = '淘宝类目抓取中：' + rows.length;
    }
    await sleep(80);
  }

  const saveResponse = await fetch(receiverUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fetchedAt: new Date().toISOString(),
      sourceUrl: location.href,
      rows,
    }),
  });
  if (!saveResponse.ok) throw new Error('本地保存失败：' + saveResponse.status);
  console.log('[wishop] 淘宝类目抓取完成，共', rows.length, '个');
  document.title = '淘宝类目抓取完成：' + rows.length;
})();`;
}

function copySnippetToClipboard(snippet) {
  const result = spawnSync('pbcopy', { input: snippet, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error('写入剪贴板失败，请确认 pbcopy 可用');
  }
}

const server = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', 'https://open.taobao.com');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'content-type');

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== 'POST' || request.url !== '/taobao-categories') {
    response.writeHead(404);
    response.end('not found');
    return;
  }

  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('end', () => {
    try {
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const count = writeOutputs(payload);
      response.writeHead(200, { 'content-type': 'application/json;charset=utf-8' });
      response.end(JSON.stringify({ ok: true, count }));
      console.log(`保存完成：${count} 个类目`);
      console.log(`JSON：${OUTPUT_JSON}`);
      console.log(`CSV：${OUTPUT_CSV}`);
      server.close();
    } catch (error) {
      response.writeHead(500, { 'content-type': 'application/json;charset=utf-8' });
      response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      console.error(error);
    }
  });
});

server.listen(PORT, HOST, () => {
  copySnippetToClipboard(browserSnippet());
  console.log(`本地接收器已启动：http://${HOST}:${PORT}`);
  console.log('抓取脚本已写入剪贴板，正在等待浏览器回传结果。');
});

setTimeout(() => {
  console.error('等待浏览器回传超时，请确认脚本已粘贴到 open.taobao.com 的 Console 并执行。');
  server.close();
  process.exitCode = 1;
}, 10 * 60 * 1000).unref();
