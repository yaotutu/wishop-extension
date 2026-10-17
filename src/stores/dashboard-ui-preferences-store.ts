import { create } from 'zustand';

/**
 * 顶级 Dashboard 模块枚举。
 *
 * 「复制商品」业务域下，Dashboard 只挂两个 tab：
 *  - productCopy：主功能（复制淘宝商品到微信小店草稿箱）
 *  - storeManagement：次要功能（绑定 / 解绑微信小店账号）
 *
 * 旧版的 orders / commonFunctions / scheduledJobs / violation / settings 已经随业务删除。
 */
export type DashboardModuleType = 'productCopy' | 'storeManagement';

interface DashboardUiPreferences {
  activeModule: DashboardModuleType;
}

interface DashboardUiPreferencesState extends DashboardUiPreferences {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setActiveModule: (activeModule: DashboardModuleType) => void;
}

const STORAGE_KEY = 'dashboardUiPreferences';
const DEFAULT_PREFERENCES: DashboardUiPreferences = {
  activeModule: 'productCopy',
};
const MODULES = new Set<DashboardModuleType>(['productCopy', 'storeManagement']);

function parsePreferences(value: unknown): DashboardUiPreferences {
  const saved = value as Partial<DashboardUiPreferences> | undefined;
  return {
    activeModule: saved?.activeModule && MODULES.has(saved.activeModule)
      ? saved.activeModule
      : DEFAULT_PREFERENCES.activeModule,
  };
}

function persistPreferences(state: DashboardUiPreferencesState): void {
  const { activeModule } = state;
  void chrome.storage.local.set({
    [STORAGE_KEY]: { activeModule },
  }).catch(() => {});
}

export const useDashboardUiPreferencesStore = create<DashboardUiPreferencesState>((set, get) => ({
  ...DEFAULT_PREFERENCES,
  hydrated: false,
  async hydrate() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    set({ ...parsePreferences(data[STORAGE_KEY]), hydrated: true });
  },
  setActiveModule(activeModule) {
    set({ activeModule });
    persistPreferences(get());
  },
}));
