import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 一次性生成“淘宝首页类目 -> 微信小店类目”的候选映射表。
 *
 * 输入：
 * 1. archive/category-mapping/source-data/taobao-home-categories/taobao-home-categories-clean.json
 *    这是前面清洗好的淘宝首页类目，只包含类目层级。
 * 2. 微信小店类目：
 *    - 优先读取 archive/wxshop-categories/source-data/wxshop-category-paths.json；
 *    - 如果本地没有，则通过微信官方接口 GET /shop/ec/category/all 拉取。
 *
 * 微信接口凭证：
 * - WXSHOP_ACCESS_TOKEN：已有 access_token 时直接使用；
 * - 或 WXSHOP_APP_ID + WXSHOP_APP_SECRET：脚本先调用 /cgi-bin/token 换 token。
 *
 * 输出：
 * - archive/category-mapping/source-data/taobao-to-wxshop-category-map.csv
 * - archive/category-mapping/source-data/taobao-to-wxshop-category-map.json
 * - archive/wxshop-categories/source-data/wxshop-category-paths.json
 *
 * 这个脚本是一次性数据工具，不接入插件运行时，不读取/打印本地账号密钥。
 */

const PROJECT_ROOT = process.cwd();
const TAOBAO_CLEAN_JSON = path.join(PROJECT_ROOT, 'archive', 'category-mapping', 'source-data', 'taobao-home-categories', 'taobao-home-categories-clean.json');
const WX_CATEGORY_DIR = path.join(PROJECT_ROOT, 'archive', 'wxshop-categories', 'source-data');
const WX_CATEGORY_JSON = path.join(WX_CATEGORY_DIR, 'wxshop-category-paths.json');
const WX_CATEGORY_CSV = path.join(WX_CATEGORY_DIR, 'wxshop-category-paths.csv');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'archive', 'category-mapping', 'source-data');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'taobao-to-wxshop-category-map.json');
const OUTPUT_CSV = path.join(OUTPUT_DIR, 'taobao-to-wxshop-category-map.csv');

const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';
const CATEGORY_URL = 'https://api.weixin.qq.com/shop/ec/category/all';
const TOP_CANDIDATE_LIMIT = 5;

const SYNONYMS = new Map([
  ['配件', ['零配件', '配件配饰', '周边']],
  ['电脑', ['计算机', 'PC']],
  ['办公', ['办公用品', '办公设备']],
  ['文具', ['学习用品', '书写工具']],
  ['家电', ['家用电器', '电器']],
  ['厨电', ['厨房电器']],
  ['手机', ['移动电话']],
  ['数码', ['3C数码', '数码产品']],
  ['家具', ['住宅家具']],
  ['家装', ['装修', '建材']],
  ['家居', ['居家日用', '家居日用']],
  ['厨具', ['厨房用具', '厨房用品']],
  ['女装', ['女士服装']],
  ['男装', ['男士服装']],
  ['内衣', ['贴身衣物']],
  ['配饰', ['饰品', '服饰配件']],
  ['女鞋', ['女士鞋靴']],
  ['男鞋', ['男士鞋靴']],
  ['运动', ['运动户外']],
  ['户外', ['户外用品']],
  ['汽车', ['车品', '汽车用品']],
  ['珠宝', ['珠宝首饰']],
  ['文玩', ['古董收藏']],
  ['箱包', ['包袋', '旅行箱']],
  ['食品', ['休闲食品', '粮油食品']],
  ['鲜花', ['花卉', '园艺']],
  ['酒水', ['酒类', '饮料']],
  ['健康', ['保健', '医疗保健']],
  ['母婴', ['母婴用品']],
  ['童装', ['儿童服装']],
  ['玩具', ['玩具乐器']],
  ['宠物', ['宠物用品']],
  ['美妆', ['美容彩妆']],
  ['个护', ['个人护理']],
  ['家清', ['家庭清洁']],
  ['香氛', ['香薰香氛']],
  ['图书', ['书籍']],
  ['乐器', ['音乐器材']],
]);

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[（）()【】\[\]{}<>《》,，、;；:：|｜+＋&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(value) {
  return normalizeText(value).replace(/\s+/g, '').toLowerCase();
}

function csvValue(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function flattenTaobaoCategories(cleanSnapshot) {
  const paths = [];

  for (const first of cleanSnapshot.categories ?? []) {
    const firstName = normalizeText(first.name);
    if (!firstName) continue;

    if (!Array.isArray(first.children) || first.children.length === 0) {
      paths.push({ names: [firstName], path: firstName });
      continue;
    }

    for (const second of first.children) {
      const secondName = normalizeText(second.name);
      if (!secondName) continue;

      if (!Array.isArray(second.children) || second.children.length === 0) {
        const names = [firstName, secondName];
        paths.push({ names, path: names.join(' / ') });
        continue;
      }

      for (const third of second.children) {
        const thirdName = normalizeText(third);
        if (!thirdName) continue;
        const names = [firstName, secondName, thirdName];
        paths.push({ names, path: names.join(' / ') });
      }
    }
  }

  return paths;
}

function normalizeCategoryId(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
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

function collectCatAndQuaWxPaths(value) {
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

function collectFlatWxPaths(nodes) {
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

function collectNestedWxPaths(nodes, parentIds = [], parentNames = []) {
  const paths = [];
  for (const node of nodes) {
    const catIds = [...parentIds, node.id];
    const names = [...parentNames, node.name];
    if (node.children.length > 0) {
      paths.push(...collectNestedWxPaths(node.children, catIds, names));
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

function dedupeWxPaths(paths) {
  const seen = new Set();
  return paths.filter(pathItem => {
    const key = pathItem.catIds.join('/');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeWxCategoryPaths(value) {
  const officialPaths = collectCatAndQuaWxPaths(value);
  if (officialPaths.length > 0) return dedupeWxPaths(officialPaths);

  const nodes = flattenCategoryNodes(value);
  const hasParentIds = nodes.some(node => Boolean(node.parentId));
  const hasNestedChildren = nodes.some(node => node.children.length > 0);
  const paths = hasParentIds
    ? collectFlatWxPaths(nodes)
    : hasNestedChildren
      ? collectNestedWxPaths(nodes)
      : collectNestedWxPaths(nodes);
  return dedupeWxPaths(paths);
}

async function getAccessTokenFromEnv() {
  const directToken = process.env.WXSHOP_ACCESS_TOKEN || process.env.WECHAT_ACCESS_TOKEN;
  if (directToken) return directToken;

  const appId = process.env.WXSHOP_APP_ID || process.env.WECHAT_APP_ID;
  const appSecret = process.env.WXSHOP_APP_SECRET || process.env.WECHAT_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error([
      '缺少微信小店接口凭证。',
      '可选方式一：设置 WXSHOP_ACCESS_TOKEN。',
      '可选方式二：设置 WXSHOP_APP_ID 和 WXSHOP_APP_SECRET。',
      '示例：WXSHOP_APP_ID=xxx WXSHOP_APP_SECRET=xxx node scripts/map-taobao-wxshop-categories.mjs',
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

async function fetchWxCategoryPaths() {
  if (existsSync(WX_CATEGORY_JSON)) {
    const cached = readJson(WX_CATEGORY_JSON);
    if (Array.isArray(cached.paths)) return cached.paths;
    if (Array.isArray(cached)) return cached;
  }

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

  mkdirSync(WX_CATEGORY_DIR, { recursive: true });
  writeJson(WX_CATEGORY_JSON, {
    source: 'GET /shop/ec/category/all',
    fetchedAt: new Date().toISOString(),
    total: paths.length,
    paths,
  });
  writeFileSync(
    WX_CATEGORY_CSV,
    [
      ['一级类目ID', '二级类目ID', '三级类目ID', '一级类目', '二级类目', '三级类目', '类目路径'].map(csvValue).join(','),
      ...paths.map(pathItem => [
        pathItem.catIds[0],
        pathItem.catIds[1],
        pathItem.catIds[2],
        pathItem.names[0],
        pathItem.names[1],
        pathItem.names[2],
        pathItem.names.join(' / '),
      ].map(csvValue).join(',')),
    ].join('\n') + '\n',
    'utf8'
  );

  return paths;
}

function collectTerms(names) {
  const terms = new Set();
  for (const name of names) {
    const normalized = normalizeText(name);
    const compact = compactText(normalized);
    if (!compact) continue;
    terms.add(compact);
    for (const part of normalized.split(/\s+/).filter(Boolean)) {
      terms.add(compactText(part));
    }
    for (const [key, values] of SYNONYMS) {
      if (compact.includes(compactText(key))) {
        terms.add(compactText(key));
        for (const value of values) terms.add(compactText(value));
      }
      if (values.some(value => compact.includes(compactText(value)))) {
        terms.add(compactText(key));
      }
    }
  }
  return Array.from(terms).filter(Boolean);
}

function charSet(value) {
  return new Set(Array.from(compactText(value)));
}

function diceCoefficientFromSets(leftSet, rightSet) {
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  let intersection = 0;
  for (const char of leftSet) {
    if (rightSet.has(char)) intersection++;
  }
  return (2 * intersection) / (leftSet.size + rightSet.size);
}

function preparePathFeatures(pathItem) {
  const names = pathItem.names;
  const leafName = names.at(-1) || '';
  const leaf = compactText(names.at(-1));
  const combined = compactText(names.join(''));
  const terms = collectTerms(names);
  const leafTerms = collectTerms([leafName]);
  const parentTerms = collectTerms(names.slice(0, -1));
  return {
    pathItem,
    names,
    compactNames: names.map(compactText),
    leaf,
    combined,
    terms,
    termSet: new Set(terms),
    leafTerms,
    parentTerms,
    charSet: charSet(combined),
    leafCharSet: charSet(leaf),
    qualificationTips: pathItem.qualificationTips || [],
  };
}

function countSharedTerms(leftTerms, rightTermSet) {
  let count = 0;
  let weighted = 0;
  const matched = [];
  for (const term of leftTerms) {
    if (!rightTermSet.has(term)) continue;
    count++;
    weighted += Math.min(35, term.length * 8);
    if (term.length >= 2) matched.push(term);
  }
  return { count, weighted, matched };
}

function scoreSharedTerms(leftTerms, rightTermSet, maxPerTerm, multiplier) {
  let weighted = 0;
  const matched = [];
  for (const term of leftTerms) {
    if (!rightTermSet.has(term)) continue;
    weighted += Math.min(maxPerTerm, term.length * multiplier);
    if (term.length >= 2) matched.push(term);
  }
  return { weighted, matched };
}

function scorePreparedMapping(taobao, wx) {
  let score = 0;
  const reasons = [];
  let hasStrongLeafMatch = false;

  if (taobao.leaf && wx.leaf && taobao.leaf === wx.leaf) {
    score += 120;
    reasons.push('叶子类目同名');
    hasStrongLeafMatch = true;
  } else if (
    taobao.leaf &&
    wx.leaf &&
    Math.min(Array.from(taobao.leaf).length, Array.from(wx.leaf).length) >= 2 &&
    (taobao.leaf.includes(wx.leaf) || wx.leaf.includes(taobao.leaf))
  ) {
    score += 80;
    reasons.push('叶子类目包含匹配');
    hasStrongLeafMatch = true;
  }

  const sharedLeafTerms = scoreSharedTerms(taobao.leafTerms, wx.termSet, 45, 10);
  score += sharedLeafTerms.weighted;
  for (const term of sharedLeafTerms.matched.slice(0, 3)) reasons.push(`叶子关键词：${term}`);
  if (sharedLeafTerms.matched.includes(taobao.leaf)) hasStrongLeafMatch = true;

  const sharedParentTerms = scoreSharedTerms(taobao.parentTerms, wx.termSet, 8, 2);
  score += sharedParentTerms.weighted;

  for (let i = 0; i < Math.min(taobao.compactNames.length, wx.compactNames.length); i++) {
    const taobaoName = taobao.compactNames[i];
    const wxName = wx.compactNames[i];
    if (taobaoName && wxName && taobaoName === wxName) {
      score += i === taobao.compactNames.length - 1 ? 35 : i === 0 ? 12 : 18;
    }
  }

  const dice = diceCoefficientFromSets(taobao.charSet, wx.charSet);
  score += dice * 25;
  const leafDice = diceCoefficientFromSets(taobao.leafCharSet, wx.leafCharSet);
  score += leafDice * 55;

  if (wx.combined.includes(taobao.leaf) || taobao.combined.includes(wx.leaf)) score += 20;
  if (wx.qualificationTips.length) score -= 3;

  const rawConfidence = Math.max(0, Math.min(0.99, score / 180));
  const confidence = hasStrongLeafMatch ? rawConfidence : Math.min(rawConfidence, 0.74);
  return {
    score: Number(score.toFixed(2)),
    confidence: Number(confidence.toFixed(3)),
    reason: Array.from(new Set(reasons)).slice(0, 3).join('；') || '字符和路径相似度匹配',
  };
}

function mapCategories(taobaoPaths, wxPaths) {
  const taobaoFeatures = taobaoPaths.map(preparePathFeatures);
  const wxFeatures = wxPaths.map(preparePathFeatures);

  return taobaoFeatures.map(taobao => {
    const candidates = wxFeatures
      .map(wx => ({
        wxCatIds: wx.pathItem.catIds,
        wxNames: wx.pathItem.names,
        wxPath: wx.pathItem.names.join(' / '),
        ...scorePreparedMapping(taobao, wx),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, TOP_CANDIDATE_LIMIT);

    const best = candidates[0] || null;
    const confidence = best?.confidence || 0;
    return {
      taobaoNames: taobao.pathItem.names,
      taobaoPath: taobao.pathItem.path,
      bestWxCatIds: best?.wxCatIds || [],
      bestWxNames: best?.wxNames || [],
      bestWxPath: best?.wxPath || '',
      confidence,
      score: best?.score || 0,
      reason: best?.reason || '',
      matchStatus: confidence >= 0.75 ? 'high' : confidence >= 0.45 ? 'review' : 'low',
      candidates,
    };
  });
}

function writeMappingOutputs(mapping, taobaoPaths, wxPaths) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeJson(OUTPUT_JSON, {
    source: 'taobao-home-clean-to-wxshop-category',
    generatedAt: new Date().toISOString(),
    taobaoPathCount: taobaoPaths.length,
    wxPathCount: wxPaths.length,
    mappingCount: mapping.length,
    mapping,
  });

  const header = [
    '淘宝一级类目',
    '淘宝二级类目',
    '淘宝三级类目',
    '淘宝类目路径',
    '微信一级类目ID',
    '微信二级类目ID',
    '微信三级类目ID',
    '微信一级类目',
    '微信二级类目',
    '微信三级类目',
    '微信类目路径',
    '置信度',
    '匹配状态',
    '分数',
    '匹配原因',
  ];

  writeFileSync(
    OUTPUT_CSV,
    [
      header.map(csvValue).join(','),
      ...mapping.map(item => [
        item.taobaoNames[0] || '',
        item.taobaoNames[1] || '',
        item.taobaoNames[2] || '',
        item.taobaoPath,
        item.bestWxCatIds[0] || '',
        item.bestWxCatIds[1] || '',
        item.bestWxCatIds[2] || '',
        item.bestWxNames[0] || '',
        item.bestWxNames[1] || '',
        item.bestWxNames[2] || '',
        item.bestWxPath,
        item.confidence,
        item.matchStatus === 'high' ? '高置信' : item.matchStatus === 'review' ? '需复核' : '低置信',
        item.score,
        item.reason,
      ].map(csvValue).join(',')),
    ].join('\n') + '\n',
    'utf8'
  );
}

async function main() {
  const taobaoClean = readJson(TAOBAO_CLEAN_JSON);
  const taobaoPaths = flattenTaobaoCategories(taobaoClean);
  const wxPaths = await fetchWxCategoryPaths();
  const mapping = mapCategories(taobaoPaths, wxPaths);
  writeMappingOutputs(mapping, taobaoPaths, wxPaths);

  const high = mapping.filter(item => item.confidence >= 0.75).length;
  const medium = mapping.filter(item => item.confidence >= 0.45 && item.confidence < 0.75).length;
  const low = mapping.filter(item => item.confidence < 0.45).length;
  console.log(JSON.stringify({
    outputJson: OUTPUT_JSON,
    outputCsv: OUTPUT_CSV,
    wxCategoryJson: WX_CATEGORY_JSON,
    taobaoPathCount: taobaoPaths.length,
    wxPathCount: wxPaths.length,
    mappingCount: mapping.length,
    confidenceBuckets: { high, medium, low },
  }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
