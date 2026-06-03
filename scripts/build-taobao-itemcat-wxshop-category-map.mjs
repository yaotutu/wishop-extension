import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 生成“淘宝 itemcat 类目 ID -> 微信小店类目候选”的本地对照表。
 *
 * 为什么单独做这个脚本：
 * - 商品采集阶段稳定拿到的是淘宝类目 ID，而不是淘宝首页导航里的中文类目；
 * - 运行时应该先用淘宝类目 ID 反查中文路径，再用本地对照表召回微信候选；
 * - AI 后续只负责从候选里最终选择，不应该接收微信小店 4000+ 全量类目。
 *
 * 输入：
 * - public/data/taobao-itemcats/taobao-itemcats-runtime.json
 * - data/wxshop-categories/wxshop-category-paths.json
 *
 * 输出：
 * - data/category-mapping/taobao-itemcat-to-wxshop-category-map.json
 * - data/category-mapping/taobao-itemcat-to-wxshop-category-map.csv
 * - data/category-mapping/taobao-itemcat-wxshop-category-map.runtime.json
 */

const PROJECT_ROOT = process.cwd();
const TAOBAO_ITEMCAT_JSON = path.join(PROJECT_ROOT, 'public', 'data', 'taobao-itemcats', 'taobao-itemcats-runtime.json');
const WX_CATEGORY_JSON = path.join(PROJECT_ROOT, 'data', 'wxshop-categories', 'wxshop-category-paths.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'data', 'category-mapping');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'taobao-itemcat-to-wxshop-category-map.json');
const OUTPUT_CSV = path.join(OUTPUT_DIR, 'taobao-itemcat-to-wxshop-category-map.csv');
const RUNTIME_OUTPUT_DIR = OUTPUT_DIR;
const RUNTIME_OUTPUT_JSON = path.join(RUNTIME_OUTPUT_DIR, 'taobao-itemcat-wxshop-category-map.runtime.json');

const TOP_CANDIDATE_LIMIT = 5;
const INCLUDE_PARENT_CATEGORIES = process.argv.includes('--include-parent');
const WRITE_FULL_JSON = process.argv.includes('--full-json');
const RUNTIME_MIN_CONFIDENCE = 0.45;

const SYNONYMS = new Map([
  ['配件', ['零配件', '配件配饰', '周边']],
  ['电脑', ['计算机', 'pc', '电脑办公']],
  ['办公', ['办公用品', '办公设备', '电脑办公']],
  ['文具', ['学习用品', '书写工具']],
  ['家电', ['家用电器', '电器']],
  ['厨电', ['厨房电器']],
  ['手机', ['移动电话', '手机配件']],
  ['数码', ['3c数码', '数码产品']],
  ['家具', ['住宅家具']],
  ['家装', ['装修', '建材']],
  ['家居', ['居家日用', '家居日用']],
  ['厨具', ['厨房用具', '厨房用品']],
  ['女装', ['女士服装', '服饰内衣']],
  ['男装', ['男士服装', '服饰内衣']],
  ['内衣', ['贴身衣物', '服饰内衣']],
  ['配饰', ['饰品', '服饰配件']],
  ['女鞋', ['女士鞋靴', '鞋靴']],
  ['男鞋', ['男士鞋靴', '鞋靴']],
  ['运动', ['运动户外']],
  ['户外', ['户外用品', '运动户外']],
  ['汽车', ['车品', '汽车用品', '汽摩电动']],
  ['珠宝', ['珠宝首饰']],
  ['文玩', ['古董收藏']],
  ['箱包', ['包袋', '旅行箱']],
  ['食品', ['休闲食品', '粮油食品', '食品饮料']],
  ['鲜花', ['花卉', '园艺']],
  ['酒水', ['酒类', '饮料']],
  ['健康', ['保健', '医疗保健']],
  ['母婴', ['母婴用品']],
  ['童装', ['儿童服装']],
  ['玩具', ['玩具乐器']],
  ['宠物', ['宠物用品', '宠物生活']],
  ['美妆', ['美容彩妆']],
  ['个护', ['个人护理']],
  ['家清', ['家庭清洁']],
  ['香氛', ['香薰香氛']],
  ['图书', ['书籍']],
  ['乐器', ['音乐器材', '玩具乐器']],
]);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value, options = {}) {
  const json = options.pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
  writeFileSync(filePath, `${json}\n`, 'utf8');
}

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

function splitCategoryName(value) {
  return normalizeText(value)
    .split(/[/>＞／]+/u)
    .map(item => normalizeText(item))
    .filter(Boolean);
}

function normalizeTaobaoPath(rawPath, fallbackName) {
  const parts = [];
  const source = Array.isArray(rawPath) && rawPath.length > 0 ? rawPath : [fallbackName];
  for (const item of source) {
    parts.push(...splitCategoryName(item));
  }
  return Array.from(new Set(parts)).filter(Boolean);
}

function flattenTaobaoItemcats(snapshot) {
  return Object.entries(snapshot.byId || {})
    .map(([id, node]) => ({
      id: String(id),
      name: normalizeText(node.name),
      path: normalizeTaobaoPath(node.path, node.name),
      parentId: String(node.parentId || ''),
      isParent: Boolean(node.isParent),
    }))
    .filter(item => item.id && item.name && item.path.length > 0)
    .filter(item => INCLUDE_PARENT_CATEGORIES || !item.isParent);
}

function normalizeWxPaths(snapshot) {
  const paths = Array.isArray(snapshot.paths) ? snapshot.paths : Array.isArray(snapshot) ? snapshot : [];
  return paths
    .map(pathItem => ({
      catIds: Array.isArray(pathItem.catIds) ? pathItem.catIds.map(String).filter(Boolean) : [],
      names: Array.isArray(pathItem.names) ? pathItem.names.map(normalizeText).filter(Boolean) : [],
      leaf: Boolean(pathItem.leaf),
      qualificationTips: Array.isArray(pathItem.qualificationTips) ? pathItem.qualificationTips.map(normalizeText).filter(Boolean) : [],
    }))
    .filter(pathItem => pathItem.leaf && pathItem.catIds.length >= 3 && pathItem.names.length >= 3);
}

function collectTerms(names) {
  const terms = new Set();
  for (const name of names) {
    const normalized = normalizeText(name);
    const compact = compactText(normalized);
    if (!compact) continue;
    terms.add(compact);
    for (const part of normalized.split(/\s+/u).filter(Boolean)) {
      terms.add(compactText(part));
    }
    for (const [key, values] of SYNONYMS) {
      const compactKey = compactText(key);
      const compactValues = values.map(compactText);
      if (compact.includes(compactKey)) {
        terms.add(compactKey);
        for (const value of compactValues) terms.add(value);
      }
      if (compactValues.some(value => compact.includes(value))) {
        terms.add(compactKey);
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
    if (rightSet.has(char)) intersection += 1;
  }
  return (2 * intersection) / (leftSet.size + rightSet.size);
}

function preparePathFeatures(pathItem) {
  const names = pathItem.path || pathItem.names;
  const leafName = names.at(-1) || '';
  const leaf = compactText(leafName);
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
    taobao.leaf
    && wx.leaf
    && Math.min(Array.from(taobao.leaf).length, Array.from(wx.leaf).length) >= 2
    && (taobao.leaf.includes(wx.leaf) || wx.leaf.includes(taobao.leaf))
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

  for (let index = 0; index < Math.min(taobao.compactNames.length, wx.compactNames.length); index += 1) {
    const taobaoName = taobao.compactNames[index];
    const wxName = wx.compactNames[index];
    if (taobaoName && wxName && taobaoName === wxName) {
      score += index === taobao.compactNames.length - 1 ? 35 : index === 0 ? 12 : 18;
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

function buildWxTermIndex(wxFeatures) {
  const index = new Map();
  wxFeatures.forEach((feature, wxIndex) => {
    for (const term of feature.terms) {
      if (!index.has(term)) index.set(term, new Set());
      index.get(term).add(wxIndex);
    }
  });
  return index;
}

function candidateWxIndexesForTaobao(taobao, wxTermIndex, wxFeatures) {
  const indexes = new Set();
  for (const term of taobao.terms) {
    for (const wxIndex of wxTermIndex.get(term) || []) indexes.add(wxIndex);
  }

  // 如果没有关键词交集，仍然用全量做兜底，避免某些冷门淘宝类目完全没有候选。
  if (indexes.size === 0) {
    wxFeatures.forEach((_feature, index) => indexes.add(index));
  }
  return Array.from(indexes);
}

function matchStatus(confidence) {
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.45) return 'review';
  return 'low';
}

function mapItemcatToWxCategories(taobaoItemcats, wxPaths) {
  const taobaoFeatures = taobaoItemcats.map(preparePathFeatures);
  const wxFeatures = wxPaths.map(preparePathFeatures);
  const wxTermIndex = buildWxTermIndex(wxFeatures);
  const rows = [];

  for (const taobao of taobaoFeatures) {
    const candidates = candidateWxIndexesForTaobao(taobao, wxTermIndex, wxFeatures)
      .map(wxIndex => {
        const wx = wxFeatures[wxIndex];
        return {
          wxCatIds: wx.pathItem.catIds,
          wxNames: wx.pathItem.names,
          wxPath: wx.pathItem.names.join(' / '),
          ...scorePreparedMapping(taobao, wx),
        };
      })
      .filter(candidate => candidate.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return right.confidence - left.confidence;
      })
      .slice(0, TOP_CANDIDATE_LIMIT);

    const best = candidates[0] || null;
    const confidence = best?.confidence || 0;
    rows.push({
      taobaoCatId: taobao.pathItem.id,
      taobaoName: taobao.pathItem.name,
      taobaoNames: taobao.names,
      taobaoPath: taobao.names.join(' / '),
      bestWxCatIds: best?.wxCatIds || [],
      bestWxNames: best?.wxNames || [],
      bestWxPath: best?.wxPath || '',
      confidence,
      score: best?.score || 0,
      reason: best?.reason || '',
      matchStatus: matchStatus(confidence),
      candidates,
    });
  }
  return rows;
}

function compactMappingRow(row, includeCandidates) {
  return {
    taobao: {
      id: row.taobaoCatId,
      name: row.taobaoName,
      names: row.taobaoNames,
      path: row.taobaoPath,
    },
    best: row.bestWxCatIds.length > 0 ? {
      catIds: row.bestWxCatIds,
      names: row.bestWxNames,
      path: row.bestWxPath,
      confidence: row.confidence,
      status: row.matchStatus,
      reason: row.reason,
    } : null,
    ...(includeCandidates ? {
      wxLeafCandidates: row.candidates.map(candidate => ({
        catIds: candidate.wxCatIds,
        names: candidate.wxNames,
        path: candidate.wxPath,
        confidence: candidate.confidence,
        status: matchStatus(candidate.confidence),
        reason: candidate.reason,
      })),
    } : {}),
  };
}

function buildRuntimeLookup(mappingRows, metadata) {
  const byTaobaoCatId = {};
  for (const row of mappingRows.filter(item => item.confidence >= RUNTIME_MIN_CONFIDENCE)) {
    byTaobaoCatId[row.taobaoCatId] = compactMappingRow(row, true);
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: 'taobao-itemcat-to-wxshop-category',
    description: '淘宝 itemcat 类目 ID 到微信小店叶子类目的本地候选映射。运行时应先按 taobaoCatId 查候选，再交给 AI/人工最终确认。',
    runtimeMinConfidence: RUNTIME_MIN_CONFIDENCE,
    ...metadata,
    runtimeMappedCount: Object.keys(byTaobaoCatId).length,
    byTaobaoCatId,
  };
}

function writeMappingOutputs(mappingRows, taobaoItemcats, wxPaths) {
  const high = mappingRows.filter(item => item.confidence >= 0.75).length;
  const review = mappingRows.filter(item => item.confidence >= 0.45 && item.confidence < 0.75).length;
  const low = mappingRows.filter(item => item.confidence > 0 && item.confidence < 0.45).length;
  const none = mappingRows.filter(item => item.confidence === 0).length;
  const metadata = {
    counts: {
      taobaoCategoryCount: taobaoItemcats.length,
      wxLeafCount: wxPaths.length,
      mappedCount: mappingRows.length,
      highConfidenceCount: high,
      reviewCount: review,
      lowConfidenceCount: low,
      noCandidateCount: none,
    },
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeJson(OUTPUT_JSON, {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: 'taobao-itemcat-to-wxshop-category',
    ...metadata,
    fullCandidateJson: WRITE_FULL_JSON,
    mapping: WRITE_FULL_JSON
      ? mappingRows
      : mappingRows.map(row => ({
          taobaoCatId: row.taobaoCatId,
          taobaoName: row.taobaoName,
          taobaoPath: row.taobaoPath,
          bestWxCatIds: row.bestWxCatIds,
          bestWxNames: row.bestWxNames,
          bestWxPath: row.bestWxPath,
          confidence: row.confidence,
          matchStatus: row.matchStatus,
          score: row.score,
          reason: row.reason,
          candidateCount: row.candidates.length,
        })),
  }, { pretty: false });

  const header = [
    '淘宝类目ID',
    '淘宝类目名称',
    '淘宝类目路径',
    '微信一级类目ID',
    '微信二级类目ID',
    '微信三级类目ID',
    '微信四级类目ID',
    '微信一级类目',
    '微信二级类目',
    '微信三级类目',
    '微信四级类目',
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
      ...mappingRows.map(item => [
        item.taobaoCatId,
        item.taobaoName,
        item.taobaoPath,
        item.bestWxCatIds[0] || '',
        item.bestWxCatIds[1] || '',
        item.bestWxCatIds[2] || '',
        item.bestWxCatIds[3] || '',
        item.bestWxNames[0] || '',
        item.bestWxNames[1] || '',
        item.bestWxNames[2] || '',
        item.bestWxNames[3] || '',
        item.bestWxPath,
        item.confidence,
        item.matchStatus === 'high' ? '高置信' : item.matchStatus === 'review' ? '需复核' : item.matchStatus === 'low' ? '低置信' : '无候选',
        item.score,
        item.reason,
      ].map(csvValue).join(',')),
    ].join('\n') + '\n',
    'utf8',
  );

  mkdirSync(RUNTIME_OUTPUT_DIR, { recursive: true });
  writeJson(RUNTIME_OUTPUT_JSON, buildRuntimeLookup(mappingRows, metadata), { pretty: false });
  return metadata.counts;
}

export function buildTaobaoItemcatWxshopCategoryMap(taobaoSnapshot, wxSnapshot) {
  const taobaoItemcats = flattenTaobaoItemcats(taobaoSnapshot);
  const wxPaths = normalizeWxPaths(wxSnapshot);
  const mappingRows = mapItemcatToWxCategories(taobaoItemcats, wxPaths);
  return {
    taobaoItemcats,
    wxPaths,
    mappingRows,
  };
}

async function main() {
  const taobaoSnapshot = readJson(TAOBAO_ITEMCAT_JSON);
  const wxSnapshot = readJson(WX_CATEGORY_JSON);
  const { taobaoItemcats, wxPaths, mappingRows } = buildTaobaoItemcatWxshopCategoryMap(taobaoSnapshot, wxSnapshot);
  const counts = writeMappingOutputs(mappingRows, taobaoItemcats, wxPaths);
  console.log(JSON.stringify({
    outputJson: OUTPUT_JSON,
    outputCsv: OUTPUT_CSV,
    runtimeOutputJson: RUNTIME_OUTPUT_JSON,
    ...counts,
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
