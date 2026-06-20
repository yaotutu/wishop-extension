import type { ViolationWordModule } from '../../shared/types';
import { normalizeViolationWordsSettings, type ViolationWordsSettings } from '../../shared/settings';
import { getAppSettings } from './settings-repository';
import { ensureAccountWorkspace, updateAccountWorkspace } from './workspace-repository.ts';
import { loadDefaultViolationWords } from '../services/default-violation-words-service';

// 违禁词已全局化：所有读写都落在 '__global_rules__' 这条全局 workspace 上，跨账号共享，
// 不再随账号存储，也不进云同步（与 productAuditRules/statusRules 一致）。
const GLOBAL_RULE_WORKSPACE_ID = '__global_rules__';

/**
 * 读取全局通用违禁词库（所有模块、所有账号共享）。
 */
export async function getGlobalViolationWords(): Promise<string[]> {
  return (await ensureAccountWorkspace(GLOBAL_RULE_WORKSPACE_ID)).rules.globalViolationWords;
}

/**
 * 写入全局通用违禁词库。调用方负责去重和 trim。
 */
export async function setGlobalViolationWords(words: string[]): Promise<void> {
  await updateAccountWorkspace(GLOBAL_RULE_WORKSPACE_ID, workspace => {
    workspace.rules.globalViolationWords = words;
  });
}

/**
 * 读取某个业务模块的专属违禁词库。未配置时返回空数组。
 */
export async function getModuleViolationWords(module: ViolationWordModule): Promise<string[]> {
  const map = (await ensureAccountWorkspace(GLOBAL_RULE_WORKSPACE_ID)).rules.moduleViolationWords;
  return Array.isArray(map?.[module]) ? map[module] : [];
}

/**
 * 写入某个业务模块的专属违禁词库。
 */
export async function setModuleViolationWords(module: ViolationWordModule, words: string[]): Promise<void> {
  await updateAccountWorkspace(GLOBAL_RULE_WORKSPACE_ID, workspace => {
    workspace.rules.moduleViolationWords = {
      ...(workspace.rules.moduleViolationWords || {}),
      [module]: words,
    };
  });
}

/**
 * 读取违禁词设置（是否启用系统默认违禁词）。设置存在 AppSettings 里，走 settings-repository。
 */
export async function getViolationWordsSettings(): Promise<ViolationWordsSettings> {
  const settings = await getAppSettings();
  return normalizeViolationWordsSettings(settings.violationWords);
}

/**
 * 合并出「商品合规扫描」用的检测词库。
 *
 * 生效词 = 开关开 ? unique([...系统默认词, ...用户自定义词]) : 用户自定义词
 * - 系统默认词只读，来源是随包 JSON（后期可切云端），见 default-violation-words-service。
 * - 用户自定义词可上传/编辑/清空。
 * - 模块级词库（moduleViolationWords）目前不并入扫描，留给复制商品等模块后期接入。
 */
export async function resolveScanWords(): Promise<string[]> {
  const userWords = await getGlobalViolationWords();
  const settings = await getViolationWordsSettings();
  if (!settings.defaultWordsEnabled) {
    return userWords;
  }
  const defaultWords = await loadDefaultViolationWords();
  // 默认词在前、用户词在后，用户词作为后写入的等价项去重即可（两者都是平等违禁词）。
  return [...new Set([...defaultWords, ...userWords])];
}
