import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 生成运行时代码可直接查表的淘宝 -> 微信小店类目静态 JSON。
 *
 * 设计目标：
 * - 输入淘宝类目路径，例如「电脑 / 电脑整机 / 笔记本电脑」；
 * - 可以直接拿到微信小店一级、二级或三级类目；
 * - 对非叶子淘宝类目，例如「电脑 / 电脑整机」，也能根据其子类目映射聚合出候选；
 * - 运行时只做 normalize + object lookup，不再做全量相似度计算。
 */

const PROJECT_ROOT = process.cwd();
const MAPPING_JSON = path.join(PROJECT_ROOT, 'archive', 'category-mapping', 'source-data', 'taobao-to-wxshop-category-map.json');
const WX_CATEGORY_JSON = path.join(PROJECT_ROOT, 'archive', 'wxshop-categories', 'source-data', 'wxshop-category-paths.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'archive', 'category-mapping', 'source-data');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'taobao-wxshop-category-lookup.json');

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function normalizeLookupKey(value) {
  return String(value ?? '')
    .replace(/[\\|｜>＞]+/g, '/')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function canonicalPath(names) {
  return names.filter(Boolean).join(' / ');
}

function compactCategory(category) {
  return {
    catIds: category.catIds,
    names: category.names,
    path: canonicalPath(category.names),
  };
}

function confidenceStatus(confidence) {
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.45) return 'review';
  return 'low';
}

function voteWeight(mapping) {
  const confidence = Number(mapping.confidence || 0);
  if (mapping.matchStatus === 'high') return confidence * confidence;
  if (mapping.matchStatus === 'review') return confidence * 0.45;
  return Math.max(0.03, confidence * 0.12);
}

function wxPrefix(mapping, level) {
  const catIds = mapping.bestWxCatIds.slice(0, level);
  const names = mapping.bestWxNames.slice(0, level);
  if (catIds.length < level || names.length < level) return null;
  return {
    catIds,
    names,
    path: canonicalPath(names),
  };
}

function topWxCandidates(descendants, level) {
  const votes = new Map();
  for (const mapping of descendants) {
    const prefix = wxPrefix(mapping, level);
    if (!prefix) continue;
    const key = prefix.catIds.join('/');
    const current = votes.get(key) || {
      ...prefix,
      weight: 0,
      totalConfidence: 0,
      count: 0,
      highCount: 0,
    };
    const weight = voteWeight(mapping);
    current.weight += weight;
    current.totalConfidence += Number(mapping.confidence || 0);
    current.count += 1;
    if (mapping.matchStatus === 'high') current.highCount += 1;
    votes.set(key, current);
  }

  const totalWeight = Array.from(votes.values()).reduce((sum, item) => sum + item.weight, 0);
  return Array.from(votes.values())
    .map(item => {
      const dominance = totalWeight > 0 ? item.weight / totalWeight : 0;
      const averageConfidence = item.count > 0 ? item.totalConfidence / item.count : 0;
      const confidence = Math.min(0.99, Number((dominance * 0.7 + averageConfidence * 0.3).toFixed(3)));
      return {
        catIds: item.catIds,
        names: item.names,
        path: item.path,
        confidence,
        status: confidenceStatus(confidence),
        supportCount: item.count,
        highSupportCount: item.highCount,
      };
    })
    .sort((left, right) => {
      if (right.confidence !== left.confidence) return right.confidence - left.confidence;
      return right.supportCount - left.supportCount;
    })
    .slice(0, 5);
}

function topWxLeafCandidates(descendants) {
  const votes = new Map();
  for (const mapping of descendants) {
    if (!mapping.bestWxCatIds.length || !mapping.bestWxNames.length) continue;
    const key = mapping.bestWxCatIds.join('/');
    const current = votes.get(key) || {
      catIds: mapping.bestWxCatIds,
      names: mapping.bestWxNames,
      path: canonicalPath(mapping.bestWxNames),
      weight: 0,
      totalConfidence: 0,
      count: 0,
      highCount: 0,
      reason: mapping.reason,
    };
    const weight = voteWeight(mapping);
    current.weight += weight;
    current.totalConfidence += Number(mapping.confidence || 0);
    current.count += 1;
    if (mapping.matchStatus === 'high') current.highCount += 1;
    votes.set(key, current);
  }

  const totalWeight = Array.from(votes.values()).reduce((sum, item) => sum + item.weight, 0);
  return Array.from(votes.values())
    .map(item => {
      const dominance = totalWeight > 0 ? item.weight / totalWeight : 0;
      const averageConfidence = item.count > 0 ? item.totalConfidence / item.count : 0;
      const confidence = Math.min(0.99, Number((dominance * 0.7 + averageConfidence * 0.3).toFixed(3)));
      return {
        catIds: item.catIds,
        names: item.names,
        path: item.path,
        confidence,
        status: confidenceStatus(confidence),
        supportCount: item.count,
        highSupportCount: item.highCount,
        reason: item.reason,
      };
    })
    .sort((left, right) => {
      if (right.confidence !== left.confidence) return right.confidence - left.confidence;
      return right.supportCount - left.supportCount;
    })
    .slice(0, 5);
}

function buildTaobaoNodeEntries(mappingRows) {
  const nodes = new Map();

  function ensureNode(names) {
    const pathKey = canonicalPath(names);
    if (!nodes.has(pathKey)) {
      nodes.set(pathKey, {
        names,
        path: pathKey,
        level: names.length,
        descendants: [],
        directMapping: null,
      });
    }
    return nodes.get(pathKey);
  }

  for (const mapping of mappingRows) {
    for (let level = 1; level <= mapping.taobaoNames.length; level += 1) {
      const node = ensureNode(mapping.taobaoNames.slice(0, level));
      node.descendants.push(mapping);
      if (level === mapping.taobaoNames.length) {
        node.directMapping = mapping;
      }
    }
  }

  return Array.from(nodes.values()).sort((left, right) => {
    if (left.level !== right.level) return left.level - right.level;
    return left.path.localeCompare(right.path, 'zh-Hans-CN');
  });
}

function buildByTaobaoPath(mappingRows) {
  const entries = {};
  const nodes = buildTaobaoNodeEntries(mappingRows);

  for (const node of nodes) {
    const direct = node.directMapping;
    const leafCandidates = direct
      ? direct.candidates.slice(0, 5).map(candidate => ({
          catIds: candidate.wxCatIds,
          names: candidate.wxNames,
          path: candidate.wxPath,
          confidence: candidate.confidence,
          status: confidenceStatus(candidate.confidence),
          reason: candidate.reason,
        }))
      : topWxLeafCandidates(node.descendants);
    const wxByLevel = {
      1: topWxCandidates(node.descendants, 1),
      2: topWxCandidates(node.descendants, 2),
      3: topWxCandidates(node.descendants, 3),
    };

    entries[node.path] = {
      taobao: {
        names: node.names,
        path: node.path,
        level: node.level,
      },
      best: {
        level1: wxByLevel[1][0] || null,
        level2: wxByLevel[2][0] || null,
        level3: wxByLevel[3][0] || null,
        leaf: leafCandidates[0] || null,
      },
      wxByLevel,
      wxLeafCandidates: leafCandidates,
      descendantCount: node.descendants.length,
      direct: direct ? {
        confidence: direct.confidence,
        status: direct.matchStatus,
        reason: direct.reason,
      } : null,
    };
  }

  return entries;
}

function buildIndexes(byTaobaoPath) {
  const normalizedPath = {};
  const byLeafName = {};
  const byAnyName = {};

  for (const pathKey of Object.keys(byTaobaoPath)) {
    const entry = byTaobaoPath[pathKey];
    normalizedPath[normalizeLookupKey(pathKey)] = pathKey;

    const leafName = entry.taobao.names.at(-1);
    if (leafName) {
      const leafKey = normalizeLookupKey(leafName);
      byLeafName[leafKey] = byLeafName[leafKey] || [];
      byLeafName[leafKey].push(pathKey);
    }

    for (const name of entry.taobao.names) {
      const key = normalizeLookupKey(name);
      byAnyName[key] = byAnyName[key] || [];
      if (!byAnyName[key].includes(pathKey)) byAnyName[key].push(pathKey);
    }
  }

  return { normalizedPath, byLeafName, byAnyName };
}

function buildWxLevels(wxPaths) {
  const levels = {};
  for (const pathItem of wxPaths) {
    for (let level = 1; level <= Math.min(pathItem.catIds.length, pathItem.names.length); level += 1) {
      levels[level] = levels[level] || new Map();
      const category = {
        catIds: pathItem.catIds.slice(0, level),
        names: pathItem.names.slice(0, level),
      };
      levels[level].set(category.catIds.join('/'), compactCategory(category));
    }
  }
  return Object.fromEntries(
    Object.entries(levels).map(([level, values]) => [level, Array.from(values.values())])
  );
}

const mappingSnapshot = readJson(MAPPING_JSON);
const wxSnapshot = readJson(WX_CATEGORY_JSON);
const mappingRows = mappingSnapshot.mapping || [];
const wxPaths = wxSnapshot.paths || [];
const byTaobaoPath = buildByTaobaoPath(mappingRows);
const wxCategoriesByLevel = buildWxLevels(wxPaths);
const maxWxDepth = Math.max(0, ...wxPaths.map(pathItem => pathItem.catIds.length));

const lookup = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  description: '淘宝首页清洗类目到微信小店类目的静态查表数据。运行时建议先用 indexes.normalizedPath 找 canonical path，再读 byTaobaoPath[path].best 或 wxByLevel[level]。',
  thresholds: {
    high: 0.75,
    review: 0.45,
  },
  counts: {
    taobaoPathCount: Object.keys(byTaobaoPath).length,
    taobaoLeafPathCount: mappingRows.length,
    wxLevel1Count: 0,
    wxLevel2Count: 0,
    wxLevel3Count: wxPaths.length,
    wxLeafCount: wxPaths.length,
    wxMaxDepth: maxWxDepth,
  },
  indexes: buildIndexes(byTaobaoPath),
  byTaobaoPath,
  wxCategoriesByLevel,
};

lookup.counts.wxLevel1Count = lookup.wxCategoriesByLevel[1]?.length || 0;
lookup.counts.wxLevel2Count = lookup.wxCategoriesByLevel[2]?.length || 0;
lookup.counts.wxLevel3Count = lookup.wxCategoriesByLevel[3]?.length || 0;

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(OUTPUT_JSON, `${JSON.stringify(lookup, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  outputJson: OUTPUT_JSON,
  ...lookup.counts,
}, null, 2));
