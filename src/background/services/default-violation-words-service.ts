/**
 * 默认违禁词数据源。
 *
 * 这是「系统默认违禁词」的唯一入口。当前从随扩展打包的静态 JSON 读取，
 * 后期切换到云端时，只需改本文件的加载实现（把 fetch 源换成远程 URL，
 * 参照 openai-compatible-client.ts 的 baseURL 归一化 + 超时/重试即可），
 * 上层 resolveScanWords / UI 都无需改动。
 *
 * 复用 taobao-itemcat-lookup.ts 的模块级 Promise 缓存模式：
 * 首次访问懒加载，进程内只加载一次。
 */

/** 默认违禁词的分类。后期云端可按类别分别下发更新。 */
export interface DefaultViolationWordCategories {
  /** 品类/敏感违规词（军警、医疗暗示、禁售品类等）。 */
  violationWords: string[];
  /** 商标侵权品牌名黑名单。 */
  brands: string[];
}

/** 随包默认词 JSON 的运行时结构。 */
interface DefaultViolationWordsData {
  /** 数据来源标识：'builtin' 本地随包 / 'cloud' 云端（后期）。 */
  source: string;
  /** 数据生成或更新时间（ISO 日期字符串）。 */
  updatedAt: string;
  /** 版本号，用于后期云端做版本对齐。 */
  version: number;
  /** 按类别拆分的默认词。 */
  categories: DefaultViolationWordCategories;
}

/** 默认词 JSON 文件相对扩展包的路径（public/ 下随包发布）。 */
const DEFAULT_VIOLATION_WORDS_PATH = 'data/violation-words/default-violation-words.json';

/** 模块级缓存：加载完成后只解析一次，进程内复用。 */
let cachedData: Promise<DefaultViolationWordsData> | undefined;

/** 清洗单个词数组：trim、去空、去重。 */
function cleanList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    const w = String(item).trim();
    if (!w || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

/**
 * 加载并解析默认违禁词 JSON。
 * 失败时回退为空分类，不阻断扫描流程（扫描退化为纯用户词模式）。
 */
async function loadDefaultViolationWordsData(): Promise<DefaultViolationWordsData> {
  if (!cachedData) {
    cachedData = (async () => {
      const url = chrome.runtime.getURL(DEFAULT_VIOLATION_WORDS_PATH);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`读取默认违禁词失败：HTTP ${response.status}`);
      }
      const raw = (await response.json()) as Partial<DefaultViolationWordsData>;
      const categories: Partial<DefaultViolationWordCategories> = raw?.categories ?? {};
      return {
        source: typeof raw?.source === 'string' ? raw.source : 'builtin',
        updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : '',
        version: typeof raw?.version === 'number' ? raw.version : 1,
        categories: {
          violationWords: cleanList(categories.violationWords),
          brands: cleanList(categories.brands),
        },
      };
    })().catch(err => {
      // 加载失败不应阻断业务，回退为空默认词，让扫描退化为纯用户词模式。
      console.warn('[default-violation-words] 加载默认违禁词失败，回退为空：', err);
      return {
        source: 'builtin',
        updatedAt: '',
        version: 0,
        categories: { violationWords: [], brands: [] },
      } satisfies DefaultViolationWordsData;
    });
  }
  return cachedData;
}

/**
 * 读取默认违禁词的「全部分类」，供需要区分展示的场景（如设置页）使用。
 */
export async function loadDefaultViolationWordCategories(): Promise<DefaultViolationWordCategories> {
  return (await loadDefaultViolationWordsData()).categories;
}

/**
 * 读取默认违禁词的合并数组（违规词 + 违品牌去重合并），供扫描匹配用。
 * 扫描是无差别合规检测，不区分类别，两类命中都算违规。
 */
export async function loadDefaultViolationWords(): Promise<string[]> {
  const { violationWords, brands } = await loadDefaultViolationWordCategories();
  return [...new Set([...violationWords, ...brands])];
}

/** 默认词元信息，供设置页展示来源、版本和分类计数。 */
export interface DefaultViolationWordsMeta {
  source: string;
  updatedAt: string;
  version: number;
  /** 违规词（品类/敏感词）数量。 */
  violationWordCount: number;
  /** 违品牌（商标侵权）数量。 */
  brandCount: number;
}

/**
 * 读取默认违禁词的元信息（来源、更新时间、版本、分类计数），供设置页展示。
 */
export async function getDefaultViolationWordsMeta(): Promise<DefaultViolationWordsMeta> {
  const data = await loadDefaultViolationWordsData();
  return {
    source: data.source,
    updatedAt: data.updatedAt,
    version: data.version,
    violationWordCount: data.categories.violationWords.length,
    brandCount: data.categories.brands.length,
  };
}
