import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 把淘宝首页采集快照整理成“只保留类目”的干净版本。
 *
 * 首页返回的数据里混有活动入口、热卖频道、榜单和推荐词。那些内容适合做运营导航，
 * 但不适合作为商品类目库。本脚本只保留 firstCateName -> secondCateName -> thirdCateName
 * 这条结构里看起来像商品类目的节点，输出给后续类目匹配流程使用。
 */

const PROJECT_ROOT = process.cwd();
const INPUT_JSON = path.join(PROJECT_ROOT, 'archive', 'category-mapping', 'source-data', 'taobao-home-categories', 'taobao-home-categories.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'archive', 'category-mapping', 'source-data', 'taobao-home-categories');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'taobao-home-categories-clean.json');
const OUTPUT_CSV = path.join(OUTPUT_DIR, 'taobao-home-categories-clean.csv');
const OUTPUT_TXT = path.join(OUTPUT_DIR, 'taobao-home-categories-clean-paths.txt');

const NOISE_EXACT = new Set([
  '热卖频道',
  '天猫榜单',
  '近期热卖',
  '热销榜单',
  '热搜速递',
  '热销推荐',
  '领大额券',
  '大家都在搜',
  '好评推荐',
  '性价比之选',
  '居家幸福感',
  '淘宝买菜',
]);

const NOISE_PATTERN = /618|开门红|官方立减|领券|补贴|红包|金币|频道|榜单|热销榜|好价榜|好评榜|热卖|推荐|好物|低至|折起|免息|试大牌|全网低价|采购优选/;

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNoiseCategory(name) {
  const normalized = normalizeText(name);
  return !normalized || NOISE_EXACT.has(normalized) || NOISE_PATTERN.test(normalized);
}

function csvValue(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function getCategoryGroups(snapshot) {
  for (const result of snapshot.raw?.prefetchResults ?? []) {
    const resultValue = result?.value?.data?.resultValue;
    if (!resultValue || typeof resultValue !== 'object') continue;

    for (const payload of Object.values(resultValue)) {
      const data = payload?.data;
      if (!Array.isArray(data)) continue;
      const hasCategoryShape = data.some(item =>
        Array.isArray(item?.children) &&
        Object.keys(item).some(key => /^firstCateName\d+$/.test(key))
      );
      if (hasCategoryShape) return data;
    }
  }

  throw new Error('没有在采集快照里找到淘宝首页类目 mtop 数据');
}

function createFirstLevelNode(name) {
  return { name, children: [], childIndex: new Map() };
}

function createSecondLevelNode(name) {
  return { name, children: [], childIndex: new Set() };
}

function addSecondLevel(firstNode, secondName) {
  if (!firstNode.childIndex.has(secondName)) {
    const node = createSecondLevelNode(secondName);
    firstNode.childIndex.set(secondName, node);
    firstNode.children.push(node);
  }
  return firstNode.childIndex.get(secondName);
}

function addThirdLevel(secondNode, thirdName) {
  if (secondNode.childIndex.has(thirdName)) return;
  secondNode.childIndex.add(thirdName);
  secondNode.children.push(thirdName);
}

function stripIndexes(categories) {
  return categories.map(first => ({
    name: first.name,
    children: first.children.map(second => ({
      name: second.name,
      children: second.children,
    })),
  }));
}

function flattenCategories(categories) {
  const rows = [];
  const paths = [];

  for (const first of categories) {
    if (!first.children.length) {
      rows.push([first.name, '', '']);
      paths.push(first.name);
      continue;
    }

    for (const second of first.children) {
      if (!second.children.length) {
        rows.push([first.name, second.name, '']);
        paths.push(`${first.name} / ${second.name}`);
        continue;
      }

      for (const third of second.children) {
        rows.push([first.name, second.name, third]);
        paths.push(`${first.name} / ${second.name} / ${third}`);
      }
    }
  }

  return { rows, paths };
}

function countSecondLevels(categories) {
  return categories.reduce((total, first) => total + first.children.length, 0);
}

function countThirdLevels(categories) {
  return categories.reduce(
    (total, first) => total + first.children.reduce((sum, second) => sum + second.children.length, 0),
    0
  );
}

function cleanCategories(snapshot) {
  const groups = getCategoryGroups(snapshot);
  const firstIndex = new Map();
  const categories = [];

  function ensureFirstLevel(name) {
    if (!firstIndex.has(name)) {
      const node = createFirstLevelNode(name);
      firstIndex.set(name, node);
      categories.push(node);
    }
    return firstIndex.get(name);
  }

  for (const group of groups) {
    const topNames = [1, 2, 3, 4]
      .map(index => normalizeText(group[`firstCateName${index}`]))
      .filter(Boolean);
    const topGroupName = topNames.join(' / ');

    if (isNoiseCategory(topGroupName)) continue;

    // 有些首页导航组当前只返回一级名称，没有二三级 children；这些一级类目仍然有价值。
    if (!Array.isArray(group.children) || group.children.length === 0) {
      for (const name of topNames) {
        if (!isNoiseCategory(name)) ensureFirstLevel(name);
      }
      continue;
    }

    for (const child of group.children) {
      const firstName = normalizeText(child.firstCateName);
      const secondName = normalizeText(child.secondCateName);
      const thirdName = normalizeText(child.thirdCateName);

      if (isNoiseCategory(firstName) || isNoiseCategory(secondName)) continue;
      const firstNode = ensureFirstLevel(firstName);
      const secondNode = addSecondLevel(firstNode, secondName);

      if (!isNoiseCategory(thirdName)) {
        addThirdLevel(secondNode, thirdName);
      }
    }
  }

  return stripIndexes(categories);
}

const snapshot = JSON.parse(readFileSync(INPUT_JSON, 'utf8'));
const categories = cleanCategories(snapshot);
const { rows, paths } = flattenCategories(categories);

const output = {
  source: 'taobao-homepage-navigation-clean',
  cleanedAt: new Date().toISOString(),
  sourceFetchedAt: snapshot.fetchedAt,
  firstLevelCount: categories.length,
  secondLevelCount: countSecondLevels(categories),
  thirdLevelCount: countThirdLevels(categories),
  pathCount: paths.length,
  categories,
};

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(OUTPUT_JSON, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
writeFileSync(
  OUTPUT_CSV,
  [
    ['一级类目', '二级类目', '三级类目'].map(csvValue).join(','),
    ...rows.map(row => row.map(csvValue).join(',')),
  ].join('\n') + '\n',
  'utf8'
);
writeFileSync(OUTPUT_TXT, `${paths.join('\n')}\n`, 'utf8');

console.log(JSON.stringify({
  outputJson: OUTPUT_JSON,
  outputCsv: OUTPUT_CSV,
  outputTxt: OUTPUT_TXT,
  firstLevelCount: output.firstLevelCount,
  secondLevelCount: output.secondLevelCount,
  thirdLevelCount: output.thirdLevelCount,
  pathCount: output.pathCount,
}, null, 2));
