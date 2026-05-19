import { create } from 'zustand';

export interface ShippingToolbarPosition {
  top: number;
  left: number;
}

const POSITION_STORAGE_KEY = 'taobaoShippingToolbarPosition';
const COLLAPSED_STORAGE_KEY = 'taobaoShippingToolbarCollapsed';
export const DEFAULT_SHIPPING_TOOLBAR_POSITION: ShippingToolbarPosition = { top: 96, left: 16 };

interface ShippingToolbarState {
  collapsed: boolean;
  position: ShippingToolbarPosition;
  hydrate: () => Promise<void>;
  setCollapsed: (collapsed: boolean) => void;
  setPosition: (position: ShippingToolbarPosition, persist?: boolean) => void;
}

export const useShippingToolbarStore = create<ShippingToolbarState>((set) => ({
  collapsed: false,
  position: DEFAULT_SHIPPING_TOOLBAR_POSITION,
  async hydrate() {
    const data = await chrome.storage.local.get([POSITION_STORAGE_KEY, COLLAPSED_STORAGE_KEY]);
    const savedPosition = data[POSITION_STORAGE_KEY] as Partial<ShippingToolbarPosition> | undefined;
    set({
      collapsed: data[COLLAPSED_STORAGE_KEY] === true,
      position: typeof savedPosition?.top === 'number' && typeof savedPosition?.left === 'number'
        ? { top: savedPosition.top, left: savedPosition.left }
        : DEFAULT_SHIPPING_TOOLBAR_POSITION,
    });
  },
  setCollapsed(collapsed) {
    set({ collapsed });
    void chrome.storage.local.set({ [COLLAPSED_STORAGE_KEY]: collapsed }).catch(() => {});
  },
  setPosition(position, persist = false) {
    set({ position });
    if (persist) {
      void chrome.storage.local.set({ [POSITION_STORAGE_KEY]: position }).catch(() => {});
    }
  },
}));
