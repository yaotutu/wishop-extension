import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * 采集淘宝首页导航类目快照。
 *
 * 这不是淘宝开放平台的标准发布类目接口，而是读取 www.taobao.com 首页暴露给消费者的
 * 导航类目。它的价值是“低成本拿到一批真实淘宝前台类目词和层级”，适合后续做商品归类、
 * 类目推荐和关键词匹配；它不保证覆盖所有叶子类目，也不包含发布所需的属性规则。
 *
 * 脚本不依赖 Playwright/Puppeteer，直接启动本机 Chrome 的 CDP 端口：
 * 1. 读取首页 HTML 里内置的 window.staticConfig.categoryBackup，得到一级导航组。
 * 2. 等待首页的 mtop 预取请求完成，保存原始响应，方便后续继续挖更深数据。
 * 3. 对每个一级导航组模拟 hover，并从展开面板中读取可见链接文本和分组。
 * 4. 输出 JSON 和 CSV，便于人工查看，也方便后面接入插件本地缓存。
 */

const PROJECT_ROOT = process.cwd();
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'archive', 'category-mapping', 'source-data', 'taobao-home-categories');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'taobao-home-categories.json');
const OUTPUT_CSV = path.join(OUTPUT_DIR, 'taobao-home-categories.csv');
const RAW_JSON = path.join(OUTPUT_DIR, 'taobao-home-raw.json');
const CHROME_PATH =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HOME_URL = 'https://www.taobao.com/';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function csvValue(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function uniqueBy(rows, keyFn) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const key = keyFn(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`请求失败：${response.status} ${url}`);
  }
  return response.json();
}

async function waitForChrome(port, deadlineMs = 15000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < deadlineMs) {
    try {
      return await fetchJson(`http://127.0.0.1:${port}/json/version`);
    } catch (error) {
      lastError = error;
      await sleep(200);
    }
  }
  throw new Error(`Chrome CDP 未在 ${deadlineMs}ms 内启动：${lastError?.message ?? ''}`);
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.callbacks = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.webSocketUrl);
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id && this.callbacks.has(message.id)) {
        const { resolve, reject } = this.callbacks.get(message.id);
        this.callbacks.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      if (message.method && this.listeners.has(message.method)) {
        for (const listener of this.listeners.get(message.method)) {
          listener(message.params);
        }
      }
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
    });
  }

  close() {
    this.socket?.close();
  }
}

async function evaluate(client, expression, timeout = 30000) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout,
  });
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.text || result.exceptionDetails.exception?.description;
    throw new Error(`页面脚本执行失败：${text}`);
  }
  return result.result.value;
}

function buildStaticRows(categoryBackup) {
  const rows = [];
  for (const group of categoryBackup) {
    const groupNames = [1, 2, 3, 4]
      .map(index => normalizeText(group[`firstCateName${index}`]))
      .filter(Boolean);
    const groupLinks = [1, 2, 3, 4].map(index => group[`firstCateLink${index}`] ?? '');
    const topGroup = groupNames.join(' / ');
    groupNames.forEach((name, index) => {
      rows.push({
        source: 'staticConfig.categoryBackup',
        level: 1,
        topGroup,
        section: '',
        name,
        href: groupLinks[index] || '',
        parentName: topGroup,
        path: `${topGroup} / ${name}`,
        position: group.__pos__ ?? null,
      });
    });
  }
  return rows;
}

function buildHoverRows(hoverPanels) {
  const rows = [];
  for (const panel of hoverPanels) {
    for (const group of panel.groups ?? []) {
      const section = normalizeText(group.section);
      for (const item of group.items ?? []) {
        const name = normalizeText(item.text);
        if (!name || name === section) continue;
        rows.push({
          source: 'dom.hoverPanel',
          level: 2,
          topGroup: panel.topGroup,
          section,
          name,
          href: item.href || '',
          parentName: section || panel.topGroup,
          path: [panel.topGroup, section, name].filter(Boolean).join(' / '),
          position: panel.position ?? null,
        });
      }
    }
  }
  return rows;
}

function findMtopCategoryGroups(prefetchResults) {
  for (const result of prefetchResults ?? []) {
    const resultValue = result?.value?.data?.resultValue;
    if (!resultValue || typeof resultValue !== 'object') continue;

    for (const [resId, payload] of Object.entries(resultValue)) {
      const data = payload?.data;
      if (!Array.isArray(data)) continue;
      const hasCategoryShape = data.some(item =>
        Array.isArray(item?.children) &&
        Object.keys(item).some(key => /^firstCateName\d+$/.test(key))
      );
      if (hasCategoryShape) {
        return { resId, groups: data };
      }
    }
  }

  return { resId: '', groups: [] };
}

function buildMtopCategoryRows(categoryGroups) {
  const rows = [];
  const seenSecond = new Set();

  for (const group of categoryGroups) {
    const groupNames = [1, 2, 3, 4]
      .map(index => normalizeText(group[`firstCateName${index}`]))
      .filter(Boolean);
    const groupLinks = [1, 2, 3, 4].map(index => group[`firstCateLink${index}`] ?? '');
    const topGroup = groupNames.join(' / ');

    groupNames.forEach((name, index) => {
      rows.push({
        source: 'mtop.aldCategory.group',
        level: 1,
        topGroup,
        section: '',
        name,
        href: groupLinks[index] || '',
        parentName: topGroup,
        path: `${topGroup} / ${name}`,
        position: group.__pos__ ?? null,
      });
    });

    for (const child of group.children ?? []) {
      const firstName = normalizeText(child.firstCateName);
      const secondName = normalizeText(child.secondCateName);
      const thirdName = normalizeText(child.thirdCateName);
      const secondKey = [topGroup, firstName, secondName, child.secondCateLink ?? ''].join('\u0001');

      if (secondName && !seenSecond.has(secondKey)) {
        seenSecond.add(secondKey);
        rows.push({
          source: 'mtop.aldCategory.second',
          level: 2,
          topGroup,
          section: firstName,
          name: secondName,
          href: child.secondCateLink || '',
          parentName: firstName || topGroup,
          path: [topGroup, firstName, secondName].filter(Boolean).join(' / '),
          position: child.__pos__ ?? null,
        });
      }

      if (thirdName) {
        rows.push({
          source: 'mtop.aldCategory.third',
          level: 3,
          topGroup,
          section: secondName,
          name: thirdName,
          href: child.thirdCateLink || '',
          parentName: secondName || firstName || topGroup,
          path: [topGroup, firstName, secondName, thirdName].filter(Boolean).join(' / '),
          position: child.__pos__ ?? null,
        });
      }
    }
  }

  return rows;
}

function buildDomMenuRows(menuTargets) {
  return menuTargets.flatMap((target, index) => {
    const names = normalizeText(target.normalizedText || target.text)
      .split('/')
      .map(part => normalizeText(part))
      .filter(Boolean);
    const topGroup = names.join(' / ');
    return names.map(name => ({
      source: 'dom.leftMenu',
      level: 1,
      topGroup,
      section: '',
      name,
      href: '',
      parentName: topGroup,
      path: `${topGroup} / ${name}`,
      position: index + 1,
    }));
  });
}

function writeOutputs(snapshot) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_JSON, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  writeFileSync(RAW_JSON, `${JSON.stringify(snapshot.raw, null, 2)}\n`, 'utf8');

  const header = ['source', 'level', 'topGroup', 'section', 'name', 'parentName', 'path', 'href', 'position'];
  const lines = [
    header.map(csvValue).join(','),
    ...snapshot.rows.map(row => header.map(key => csvValue(row[key])).join(',')),
  ];
  writeFileSync(OUTPUT_CSV, `${lines.join('\n')}\n`, 'utf8');
}

async function run() {
  const port = await getFreePort();
  const userDataDir = path.join(tmpdir(), `dianxiaoqi-taobao-home-cdp-${Date.now()}`);
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--window-size=1920,1200',
    HOME_URL,
  ], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  chrome.stderr.on('data', chunk => {
    const text = String(chunk);
    if (/DevTools listening/.test(text)) return;
    if (/ERROR|FATAL/i.test(text)) process.stderr.write(text);
  });

  try {
    await waitForChrome(port);
    const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
    const pageTarget = targets.find(target => target.type === 'page') ?? targets[0];
    if (!pageTarget?.webSocketDebuggerUrl) {
      throw new Error('没有找到可连接的 Chrome 页面 target');
    }

    const client = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();

    const interestingRequests = new Map();
    client.on('Network.responseReceived', params => {
      const url = params.response?.url ?? '';
      if (/AldLampServiceFixedResV2|mtop/i.test(url)) {
        interestingRequests.set(params.requestId, {
          url,
          status: params.response.status,
          mimeType: params.response.mimeType,
        });
      }
    });

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1200,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send('Page.navigate', { url: HOME_URL });
    await sleep(8000);

    const pageState = await evaluate(client, `(() => {
      const cfg = window.staticConfig || {};
      return {
        url: location.href,
        title: document.title,
        staticKeys: Object.keys(cfg),
        categoryBackup: cfg.categoryBackup || [],
        coreAldMultiRequestConfig: window.$coreAldMultiRequestConfig || null,
        hasMtop: Boolean(window.lib && window.lib.mtop),
        prefetchCount: Array.isArray(window.__pc_index_head_prefetch_list__)
          ? window.__pc_index_head_prefetch_list__.length
          : 0,
        bodyPreview: (document.body?.innerText || '').slice(0, 1000),
      };
    })()`);

    const prefetchResults = await evaluate(client, `(async () => {
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
      for (let i = 0; i < 10; i += 1) {
        if (Array.isArray(window.__pc_index_head_prefetch_list__) && window.__pc_index_head_prefetch_list__.length) break;
        await sleep(500);
      }
      const list = window.__pc_index_head_prefetch_list__ || [];
      const settled = await Promise.allSettled(list.map(item => Promise.resolve(item)));
      return settled.map(item => item.status === 'fulfilled'
        ? { status: item.status, value: item.value }
        : { status: item.status, reason: String(item.reason) });
    })()`, 20000);

    const categoryBackup = Array.isArray(pageState.categoryBackup) ? pageState.categoryBackup : [];
    const menuTargets = await evaluate(client, `(() => {
        const isVisible = element => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 20 && rect.height > 12 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const nodes = Array.from(document.querySelectorAll('li, a, div, span'));
        const candidates = nodes
          .map(element => {
            const text = (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
            const normalizedText = text.replace(/[\\uE000-\\uF8FF]+/g, '/').replace(/\\s+/g, ' ').trim();
            const rect = element.getBoundingClientRect();
            return {
              text,
              normalizedText,
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              area: rect.width * rect.height,
              tagName: element.tagName,
            };
          })
          .filter(item =>
            item.normalizedText.includes('/') &&
            item.normalizedText.split('/').filter(Boolean).length >= 4 &&
            item.area > 200 &&
            item.left >= 0 &&
            item.left < 520 &&
            item.top >= 0 &&
            item.top < Math.min(window.innerHeight, 1150) &&
            item.width < 520 &&
            item.height < 120 &&
            item.width > 100 &&
            item.height > 20 &&
            item.normalizedText.length < 80
          )
          .sort((a, b) => a.top === b.top ? a.area - b.area : a.top - b.top);

        const unique = [];
        for (const candidate of candidates) {
          if (unique.some(item => Math.abs(item.top - candidate.top) < 8)) continue;
          unique.push(candidate);
        }
        return unique.slice(0, 20);
      })()`);

    const hoverPanels = [];
    for (const target of menuTargets) {
      const topGroup = normalizeText(target.normalizedText || target.text)
        .split('/')
        .map(part => normalizeText(part))
        .filter(Boolean)
        .join(' / ');

      if (!target) {
        hoverPanels.push({
          topGroup,
          position: null,
          status: 'target_not_found',
          groups: [],
        });
        continue;
      }

      await client.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Math.round(target.left + target.width / 2),
        y: Math.round(target.top + target.height / 2),
      });
      await sleep(900);

      const panel = await evaluate(client, `(() => {
        const topGroup = ${JSON.stringify(topGroup)};
        const isVisible = element => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 20 &&
            rect.height > 12 &&
            rect.right > 0 &&
            rect.bottom > 0 &&
            rect.left < window.innerWidth &&
            rect.top < window.innerHeight &&
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            Number(style.opacity || 1) !== 0;
        };
        const candidates = Array.from(document.querySelectorAll('div, section, nav, aside'))
          .map(element => {
            const rect = element.getBoundingClientRect();
          const text = (element.innerText || '').replace(/\\s+/g, ' ').trim();
          return { element, rect, text };
        })
        .filter(item =>
          isVisible(item.element) &&
            item.rect.left > 320 &&
            item.rect.top < 760 &&
            item.rect.width > 450 &&
            item.rect.height > 120 &&
            item.text.length > 30
          )
        .map(item => {
          const links = Array.from(item.element.querySelectorAll('a, [role="link"]'))
            .map((element, index) => {
              const rect = element.getBoundingClientRect();
              const text = (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
              return {
                index,
                text,
                href: element.href || element.getAttribute('href') || '',
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
              };
            })
            .filter(link => link.text && link.width > 2 && link.height > 2)
            .sort((a, b) => a.top === b.top ? a.left - b.left : a.top - b.top);

          const visualRows = [];
          for (const link of links) {
            const previous = visualRows[visualRows.length - 1];
            if (previous && Math.abs(previous.top - link.top) < 14) {
              previous.items.push(link);
            } else {
              visualRows.push({ top: link.top, items: [link] });
            }
          }

          const groups = [];
          for (const visualRow of visualRows) {
            const ordered = visualRow.items.sort((a, b) => a.left - b.left);
            const first = ordered[0];
            const isSectionRow = Boolean(first && /[\uE000-\uF8FF]/.test(first.text));
            if (isSectionRow) {
              const section = first.text.replace(/[>＞]$/, '').trim();
              groups.push({ section, items: ordered.slice(1) });
            } else if (groups.length) {
              groups[groups.length - 1].items.push(...ordered);
            } else {
              groups.push({ section: '', items: ordered });
            }
          }

          const adPenalty = /官方旗舰店|狂欢节|领券中心|抢官方补贴/.test(item.text) ? 200 : 0;
          const score =
            groups.length * 100 +
            links.length * 3 -
            Math.abs(item.rect.left - 520) / 8 -
            Math.abs(item.rect.top - 110) / 8 -
            adPenalty;

          return {
            element: item.element,
            text: item.text,
            links,
            groups,
            score,
          };
        })
        .filter(item => item.links.length > 5 || item.groups.length > 2)
        .sort((a, b) => b.score - a.score);

        const selected = candidates[0] || null;
        if (!selected) {
          return { topGroup, status: 'panel_not_found', text: '', groups: [] };
        }

        return {
          topGroup,
          status: 'ok',
          text: selected.text.slice(0, 4000),
          groups: selected.groups,
        };
      })()`);

      hoverPanels.push({
        ...panel,
        position: menuTargets.indexOf(target) + 1,
      });
    }

    const networkResponses = [];
    for (const [requestId, meta] of interestingRequests) {
      try {
        const body = await client.send('Network.getResponseBody', { requestId });
        networkResponses.push({ ...meta, body });
      } catch (error) {
        networkResponses.push({ ...meta, error: error.message });
      }
    }

    const mtopCategory = findMtopCategoryGroups(prefetchResults);
    const mtopCategoryRows = buildMtopCategoryRows(mtopCategory.groups);
    const staticRows = buildStaticRows(categoryBackup);
    const domMenuRows = buildDomMenuRows(menuTargets);
    const hoverRows = buildHoverRows(hoverPanels);
    const rows = uniqueBy([...mtopCategoryRows, ...hoverRows, ...domMenuRows, ...staticRows], row =>
      [row.topGroup, row.section, row.name].join('\u0001')
    );

    const snapshot = {
      source: 'taobao-homepage-navigation',
      fetchedAt: new Date().toISOString(),
      url: pageState.url,
      totalRows: rows.length,
      mtopCategoryResId: mtopCategory.resId,
      mtopCategoryGroupCount: mtopCategory.groups.length,
      mtopCategoryRowCount: mtopCategoryRows.length,
      staticRowCount: staticRows.length,
      domMenuRowCount: domMenuRows.length,
      hoverRowCount: hoverRows.length,
      hoverPanelCount: hoverPanels.filter(panel => panel.status === 'ok').length,
      rows,
      raw: {
        pageState,
        prefetchResults,
        menuTargets,
        hoverPanels,
        networkResponses,
      },
    };

    writeOutputs(snapshot);
    console.log(JSON.stringify({
      outputJson: OUTPUT_JSON,
      outputCsv: OUTPUT_CSV,
      rawJson: RAW_JSON,
      totalRows: snapshot.totalRows,
      mtopCategoryResId: snapshot.mtopCategoryResId,
      mtopCategoryGroupCount: snapshot.mtopCategoryGroupCount,
      mtopCategoryRowCount: snapshot.mtopCategoryRowCount,
      staticRowCount: snapshot.staticRowCount,
      domMenuRowCount: snapshot.domMenuRowCount,
      hoverRowCount: snapshot.hoverRowCount,
      hoverPanelCount: snapshot.hoverPanelCount,
    }, null, 2));

    client.close();
  } finally {
    chrome.kill('SIGTERM');
    try {
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch {
      // Chrome 有时会在退出后短暂保留锁文件；临时 profile 不影响采集结果。
    }
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
