import { create } from 'zustand';

export type DashboardModuleType = 'orders' | 'storeManagement' | 'productListing' | 'commonFunctions' | 'scheduledJobs' | 'violation' | 'settings';
export type ProductReviewScope = 'global' | 'account';
export type ProductReviewGlobalView = 'tasks' | 'rules';
export type SettingsTab = 'about' | 'product' | 'license' | 'aiListing' | 'contact';

interface DashboardUiPreferences {
  activeModule: DashboardModuleType;
  productReviewScope: ProductReviewScope;
  productReviewGlobalView: ProductReviewGlobalView;
  settingsTab: SettingsTab;
}

interface DashboardUiPreferencesState extends DashboardUiPreferences {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setActiveModule: (activeModule: DashboardModuleType) => void;
  setProductReviewScope: (productReviewScope: ProductReviewScope) => void;
  setProductReviewGlobalView: (productReviewGlobalView: ProductReviewGlobalView) => void;
  setSettingsTab: (settingsTab: SettingsTab) => void;
}

const STORAGE_KEY = 'dashboardUiPreferences';
const DEFAULT_PREFERENCES: DashboardUiPreferences = {
  activeModule: 'commonFunctions',
  productReviewScope: 'account',
  productReviewGlobalView: 'tasks',
  settingsTab: 'about',
};
const MODULES = new Set<DashboardModuleType>(['orders', 'storeManagement', 'productListing', 'commonFunctions', 'scheduledJobs', 'violation', 'settings']);
const REVIEW_SCOPES = new Set<ProductReviewScope>(['global', 'account']);
const REVIEW_GLOBAL_VIEWS = new Set<ProductReviewGlobalView>(['tasks', 'rules']);
const SETTINGS_TABS = new Set<SettingsTab>(['about', 'product', 'license', 'aiListing', 'contact']);

function parsePreferences(value: unknown): DashboardUiPreferences {
  const saved = value as Partial<DashboardUiPreferences> | undefined;
  return {
    activeModule: saved?.activeModule && MODULES.has(saved.activeModule)
      ? saved.activeModule
      : DEFAULT_PREFERENCES.activeModule,
    productReviewScope: saved?.productReviewScope && REVIEW_SCOPES.has(saved.productReviewScope)
      ? saved.productReviewScope
      : DEFAULT_PREFERENCES.productReviewScope,
    productReviewGlobalView: saved?.productReviewGlobalView && REVIEW_GLOBAL_VIEWS.has(saved.productReviewGlobalView)
      ? saved.productReviewGlobalView
      : DEFAULT_PREFERENCES.productReviewGlobalView,
    settingsTab: saved?.settingsTab && SETTINGS_TABS.has(saved.settingsTab)
      ? saved.settingsTab
      : DEFAULT_PREFERENCES.settingsTab,
  };
}

function persistPreferences(state: DashboardUiPreferencesState): void {
  const { activeModule, productReviewScope, productReviewGlobalView, settingsTab } = state;
  void chrome.storage.local.set({
    [STORAGE_KEY]: { activeModule, productReviewScope, productReviewGlobalView, settingsTab },
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
  setProductReviewGlobalView(productReviewGlobalView) {
    set({ productReviewGlobalView });
    persistPreferences(get());
  },
  setSettingsTab(settingsTab) {
    set({ settingsTab });
    persistPreferences(get());
  },
}));
