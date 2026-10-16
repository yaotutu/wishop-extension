import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 一次性生成微信小店全量叶子类目缓存。
 *
 * 这个脚本只用于开发期/人工刷新静态数据，不接入插件运行时：
 * - 默认优先读取 archive/wxshop-categories/source-data/wxshop-category-paths.json；
 * - 加 --refresh 或本地没有快照时，才调用微信官方 GET /shop/ec/category/all；
 * - 输出给 AI 使用的叶子类目路径列表到 public/data/wxshop-categories。
 *
 * 凭证安全：
 * - 支持 WXSHOP_ACCESS_TOKEN 直接调用；
 * - 或通过 WXSHOP_APP_ID + WXSHOP_APP_SECRET 换取 access_token；
 * - 脚本不会打印、缓存或写出 access_token / appSecret。
 */

const PROJECT_ROOT = process.cwd();
const SOURCE_JSON = path.join(PROJECT_ROOT, 'archive', 'wxshop-categories', 'source-data', 'wxshop-category-paths.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'public', 'data', 'wxshop-categories');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'wxshop-category-paths.runtime.json');
const OUTPUT_CSV = path.join(OUTPUT_DIR, 'wxshop-category-paths.runtime.csv');

const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';
const CATEGORY_URL = 'https://api.weixin.qq.com/shop/ec/category/all';

const SHOULD_REFRESH = process.argv.includes('--refresh');
const OUT_ARG = readArgValue('--out');
const CSV_ARG = readArgValue('--csv-out');
const FINAL_OUTPUT_JSON = OUT_ARG ? path.resolve(PROJECT_ROOT, OUT_ARG) : OUTPUT_JSON;
const FINAL_OUTPUT_CSV = CSV_ARG ? path.resolve(PROJECT_ROOT, CSV_ARG) : OUTPUT_CSV;

function readArgValue(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find(arg => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim();
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1]?.trim() || '';
  return '';
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[（）()【】\[\]{}<>《》,，、;；:：|｜+＋&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCategoryId(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function csvValue(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readCategoryChildren(record) {
  const value = record.children
    ?? record.child
    ?? record.childs
    ?? record.child_categories
    ?? record.child_category_list;
  return Array.isArray(value) ? value : [];
}

function readQualificationTips(record) {
  const rawTips = record.qualification_tips
    ?? record.qualificationTips
    ?? record.qua_tips
    ?? record.tips;
  if (!Array.isArray(rawTips)) return [];
  return rawTips.map(item => normalizeText(item)).filter(Boolean);
}

function readRawCategoryNode(value) {
  if (!value || typeof value !== 'object') return null;
  const record = value;
  const catRecord = record.cat && typeof record.cat === 'object' ? record.cat : record;
  const id = normalizeCategoryId(catRecord.cat_id ?? catRecord.catId ?? catRecord.id);
  const name = normalizeText(catRecord.name ?? catRecord.cat_name ?? catRecord.catName);
  if (!id || !name) return null;

  const children = readCategoryChildren(catRecord)
    .map(readRawCategoryNode)
    .filter(Boolean);
  const leafValue = catRecord.leaf ?? catRecord.is_leaf ?? catRecord.isLeaf;
  const leaf = typeof leafValue === 'boolean' ? leafValue : children.length === 0;

  return {
    id,
    name,
    parentId: normalizeCategoryId(
      catRecord.f_cat_id
        ?? catRecord.fCatId
        ?? catRecord.parent_cat_id
        ?? catRecord.parentCatId
        ?? catRecord.parent_id
        ?? catRecord.parentId,
    ),
    leaf,
    children,
    qualificationTips: readQualificationTips(catRecord),
  };
}

function flattenCategoryNodes(value) {
  if (!Array.isArray(value)) return [];
  return value.map(readRawCategoryNode).filter(Boolean);
}

function readCatAndQuaList(record) {
  const value = record.cat_and_qua
    ?? record.catAndQua
    ?? record.catandqua
    ?? record.catand_qua;
  return Array.isArray(value) ? value : [];
}

function collectCatAndQuaPaths(value) {
  if (!Array.isArray(value)) return [];
  const paths = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const catAndQua = readCatAndQuaList(item);
    if (catAndQua.length === 0) continue;

    const lineage = catAndQua
      .map(record => {
        const cat = record?.cat && typeof record.cat === 'object' ? record.cat : null;
        if (!cat) return null;
        const id = normalizeCategoryId(cat.cat_id ?? cat.catId ?? cat.id);
        const name = normalizeText(cat.name ?? cat.cat_name ?? cat.catName);
        const level = Number(cat.level || 0);
        if (!id || !name) return null;
        return {
          id,
          name,
          level,
          leaf: Boolean(cat.leaf),
          qualificationTips: [
            normalizeText(record?.qua?.tips),
            normalizeText(record?.product_qua?.tips),
            normalizeText(record?.brand_qua?.tips),
            ...(Array.isArray(record?.product_qua_list)
              ? record.product_qua_list.map(qua => normalizeText(qua?.tips || qua?.name))
              : []),
          ].filter(Boolean),
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.level - right.level);

    if (lineage.length >= 3) {
      const leaf = lineage.at(-1);
      paths.push({
        catIds: lineage.map(cat => cat.id),
        names: lineage.map(cat => cat.name),
        leaf: true,
        qualificationTips: leaf.qualificationTips,
      });
    }
  }

  return paths;
}

function collectFlatCategoryPaths(nodes) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const childrenByParent = new Map();
  for (const node of nodes) {
    if (!node.parentId || !byId.has(node.parentId)) continue;
    const children = childrenByParent.get(node.parentId) || [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  }

  const paths = [];
  for (const node of nodes) {
    const children = childrenByParent.get(node.id) || [];
    const isLeaf = node.leaf || children.length === 0;
    if (!isLeaf) continue;

    const lineage = [];
    const visited = new Set();
    let current = node;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      lineage.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }

    if (lineage.length >= 3) {
      paths.push({
        catIds: lineage.map(item => item.id),
        names: lineage.map(item => item.name),
        leaf: true,
        qualificationTips: node.qualificationTips,
      });
    }
  }
  return paths;
}

function collectNestedCategoryPaths(nodes, parentIds = [], parentNames = []) {
  const paths = [];
  for (const node of nodes) {
    const catIds = [...parentIds, node.id];
    const names = [...parentNames, node.name];
    if (node.children.length > 0) {
      paths.push(...collectNestedCategoryPaths(node.children, catIds, names));
      continue;
    }
    if (node.leaf && catIds.length >= 3) {
      paths.push({
        catIds,
        names,
        leaf: true,
        qualificationTips: node.qualificationTips,
      });
    }
  }
  return paths;
}

function dedupeCategoryPaths(paths) {
  const seen = new Set();
  return paths.filter(pathItem => {
    const key = pathItem.catIds.join('/');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeWxCategoryPaths(value) {
  const officialPaths = collectCatAndQuaPaths(value);
  if (officialPaths.length > 0) return dedupeCategoryPaths(officialPaths);

  const nodes = flattenCategoryNodes(value);
  const hasParentIds = nodes.some(node => Boolean(node.parentId));
  const hasNestedChildren = nodes.some(node => node.children.length > 0);
  const paths = hasParentIds
    ? collectFlatCategoryPaths(nodes)
    : hasNestedChildren
      ? collectNestedCategoryPaths(nodes)
      : collectNestedCategoryPaths(nodes);
  return dedupeCategoryPaths(paths);
}

function normalizeCachedPath(value) {
  if (!value || typeof value !== 'object') return null;
  const catIds = Array.isArray(value.catIds)
    ? value.catIds.map(normalizeCategoryId).filter(Boolean)
    : [];
  const names = Array.isArray(value.names)
    ? value.names.map(normalizeText).filter(Boolean)
    : [];
  if (catIds.length < 3 || names.length !== catIds.length) return null;

  const qualificationTips = Array.isArray(value.qualificationTips)
    ? value.qualificationTips.map(normalizeText).filter(Boolean)
    : [];
  return {
    catIds,
    names,
    path: names.join(' / '),
    leaf: true,
    ...(qualificationTips.length > 0 ? { qualificationTips } : {}),
  };
}

function normalizeCachedSnapshot(snapshot) {
  const rawPaths = Array.isArray(snapshot?.paths) ? snapshot.paths : Array.isArray(snapshot) ? snapshot : [];
  return rawPaths.map(normalizeCachedPath).filter(Boolean);
}

function assertValidRuntimePaths(paths) {
  if (paths.length === 0) {
    throw new Error('微信小店类目快照为空，无法生成 AI 候选缓存');
  }

  const seen = new Set();
  for (const pathItem of paths) {
    if (!Array.isArray(pathItem.catIds) || pathItem.catIds.length < 3) {
      throw new Error(`类目路径缺少完整 catIds：${JSON.stringify(pathItem)}`);
    }
    if (!Array.isArray(pathItem.names) || pathItem.names.length !== pathItem.catIds.length) {
      throw new Error(`类目路径 names 与 catIds 层级不一致：${JSON.stringify(pathItem)}`);
    }
    const key = pathItem.catIds.join('/');
    if (seen.has(key)) {
      throw new Error(`类目路径重复：${key}`);
    }
    seen.add(key);
  }
}

async function getAccessTokenFromEnv() {
  const directToken = process.env.WXSHOP_ACCESS_TOKEN || process.env.WECHAT_ACCESS_TOKEN;
  if (directToken) return directToken.trim();

  const appId = process.env.WXSHOP_APP_ID || process.env.WECHAT_APP_ID;
  const appSecret = process.env.WXSHOP_APP_SECRET || process.env.WECHAT_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error([
      '缺少微信小店接口凭证。',
      '可选方式一：设置 WXSHOP_ACCESS_TOKEN。',
      '可选方式二：设置 WXSHOP_APP_ID 和 WXSHOP_APP_SECRET。',
      '示例：WXSHOP_APP_ID=xxx WXSHOP_APP_SECRET=xxx npm run data:wxshop-categories -- --refresh',
    ].join('\n'));
  }

  const url = new URL(TOKEN_URL);
  url.searchParams.set('grant_type', 'client_credential');
  url.searchParams.set('appid', appId);
  url.searchParams.set('secret', appSecret);

  const response = await fetch(url);
  const payload = await response.json();
  if (payload.errcode) {
    throw new Error(`获取微信 access_token 失败：${payload.errcode} ${payload.errmsg || ''}`.trim());
  }
  if (!payload.access_token) {
    throw new Error('获取微信 access_token 失败：接口未返回 access_token');
  }
  return payload.access_token;
}

async function fetchWxCategoryPathsFromApi() {
  const accessToken = await getAccessTokenFromEnv();
  const url = new URL(CATEGORY_URL);
  url.searchParams.set('access_token', accessToken);

  const response = await fetch(url);
  const payload = await response.json();
  if (payload.errcode && payload.errcode !== 0) {
    throw new Error(`获取微信小店类目失败：${payload.errcode} ${payload.errmsg || ''}`.trim());
  }

  const paths = normalizeWxCategoryPaths(payload.cats_v2 ?? payload.cats ?? payload.category_list ?? []);
  if (paths.length === 0) {
    throw new Error('微信小店类目接口未返回可用三级叶子类目');
  }
  return paths.map(normalizeCachedPath).filter(Boolean);
}

async function loadSourcePaths() {
  if (!SHOULD_REFRESH && existsSync(SOURCE_JSON)) {
    return normalizeCachedSnapshot(readJson(SOURCE_JSON));
  }
  return fetchWxCategoryPathsFromApi();
}

function createRuntimeSnapshot(paths) {
  return {
    version: 1,
    source: SHOULD_REFRESH ? 'wxshop.category.all' : 'archive/wxshop-categories/source-data/wxshop-category-paths.json',
    generatedAt: Date.now(),
    total: paths.length,
    paths,
  };
}

function writeRuntimeCsv(filePath, paths) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const maxDepth = Math.max(...paths.map(pathItem => pathItem.catIds.length));
  const idHeaders = Array.from({ length: maxDepth }, (_, index) => `第${index + 1}级类目ID`);
  const nameHeaders = Array.from({ length: maxDepth }, (_, index) => `第${index + 1}级类目`);
  const rows = [
    [...idHeaders, ...nameHeaders, '类目路径'].map(csvValue).join(','),
    ...paths.map(pathItem => [
      ...Array.from({ length: maxDepth }, (_, index) => pathItem.catIds[index] || ''),
      ...Array.from({ length: maxDepth }, (_, index) => pathItem.names[index] || ''),
      pathItem.path,
    ].map(csvValue).join(',')),
  ];
  writeFileSync(filePath, `${rows.join('\n')}\n`, 'utf8');
}

async function main() {
  const paths = await loadSourcePaths();
  const dedupedPaths = dedupeCategoryPaths(paths).map(normalizeCachedPath).filter(Boolean);
  assertValidRuntimePaths(dedupedPaths);

  const snapshot = createRuntimeSnapshot(dedupedPaths);
  writeJson(FINAL_OUTPUT_JSON, snapshot);
  writeRuntimeCsv(FINAL_OUTPUT_CSV, dedupedPaths);

  console.log(`微信小店类目缓存已生成：${FINAL_OUTPUT_JSON}`);
  console.log(`类目数量：${dedupedPaths.length}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
