import type { ViolationWordModule } from '../../shared/types';
import {
  getGlobalViolationWords,
  getModuleViolationWords,
  getViolationWordsSettings,
  setGlobalViolationWords,
  setModuleViolationWords,
} from '../store/violation-word-repository';
import {
  getDefaultViolationWordsMeta,
  loadDefaultViolationWords,
  loadDefaultViolationWordCategories,
} from '../services/default-violation-words-service';
import type { RuntimeHandlerMap } from '../router/runtime-router';

/**
 * 注册违禁词库管理类 channel（全局通用词库 + 模块级词库 + 系统默认词 + 设置）。
 * 这些 channel 与账号无关，统一读写全局 workspace 或只读默认词数据源。
 */
export function createViolationWordRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'violationWords:getGlobal'() {
      return getGlobalViolationWords();
    },
    async 'violationWords:setGlobal'(args) {
      return setGlobalViolationWords(args[0] as string[]);
    },
    async 'violationWords:getModule'(args) {
      return getModuleViolationWords(args[0] as ViolationWordModule);
    },
    async 'violationWords:setModule'(args) {
      return setModuleViolationWords(args[0] as ViolationWordModule, args[1] as string[]);
    },
    async 'violationWords:getDefaults'() {
      // 返回分类词数组 + 合并总数 + 元信息，供设置页分类展示。
      const [categories, meta] = await Promise.all([
        loadDefaultViolationWordCategories(),
        getDefaultViolationWordsMeta(),
      ]);
      const totalCount = meta.violationWordCount + meta.brandCount;
      return {
        // 合并后的全部词（违规词 + 违品牌），供需要总数/合并匹配的场景。
        words: [...new Set([...categories.violationWords, ...categories.brands])],
        totalCount,
        violationWords: categories.violationWords,
        brands: categories.brands,
        source: meta.source,
        updatedAt: meta.updatedAt,
        version: meta.version,
      };
    },
    async 'violationWords:getSettings'() {
      return getViolationWordsSettings();
    },
  };
}
