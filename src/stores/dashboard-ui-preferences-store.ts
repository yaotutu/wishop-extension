import { create } from 'zustand';

export type DashboardModuleType = 'orders' | 'storeManagement' | 'commonFunctions' | 'scheduledJobs' | 'violation' | 'settings';
export type ProductReviewScope = 'global' | 'account';
export type SettingsTab = 'about' | 'product' | 'license' | 'contact';

interface DashboardUiPreferences {
  activeModule: DashboardModuleType;
  productReviewScope: ProductReviewScope;
  settingsTab: SettingsTab;
}

interface DashboardUiPreferencesState extends DashboardUiPreferences {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setActiveModule: (activeModule: DashboardModuleType) => void;
  setProductReviewScope: (productReviewScope: ProductReviewScope) => void;
  setSettingsTab: (settingsTab: SettingsTab) => void;
}

const STORAGE_KEY = 'dashboardUiPreferences';
const DEFAULT_PREFERENCES: DashboardUiPreferences = {
  activeModule: 'commonFunctions',
  productReviewScope: 'account',
  settingsTab: 'about',
};
const MODULES = new Set<DashboardModuleType>(['orders', 'storeManagement', 'commonFunctions', 'scheduledJobs', 'violation', 'settings']);
const REVIEW_SCOPES = new Set<ProductReviewScope>(['global', 'account']);
const SETTINGS_TABS = new Set<SettingsTab>(['about', 'product', 'license', 'contact']);

function parsePreferences(value: unknown): DashboardUiPreferences {
  const saved = value as Partial<DashboardUiPreferences> | undefined;
  return {
    activeModule: saved?.activeModule && MODULES.has(saved.activeModule)
      ? saved.activeModule
      : DEFAULT_PREFERENCES.activeModule,
    productReviewScope: saved?.productReviewScope && REVIEW_SCOPES.has(saved.productReviewScope)
      ? saved.productReviewScope
      : DEFAULT_PREFERENCES.productReviewScope,
    settingsTab: saved?.settingsTab && SETTINGS_TABS.has(saved.settingsTab)
      ? saved.settingsTab
      : DEFAULT_PREFERENCES.settingsTab,
  };
}

function persistPreferences(state: DashboardUiPreferencesState): void {
  const { activeModule, productReviewScope, settingsTab } = state;
  void chrome.storage.local.set({
    [STORAGE_KEY]: { activeModule, productReviewScope, settingsTab },
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
  setProductReviewScope(productReviewScope) {
    set({ productReviewScope });
    persistPreferences(get());
  },
  setSettingsTab(settingsTab) {
    set({ settingsTab });
    persistPreferences(get());
  },
}));
