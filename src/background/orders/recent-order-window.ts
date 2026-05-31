export interface RecentOrderWindowState {
  windowEndTime: number;
  minStartTime: number;
}

export const RECENT_ORDER_WINDOW_SECONDS = 7 * 24 * 60 * 60;

export function makeRecentOrderWindowState(nowSeconds = Math.floor(Date.now() / 1000), lookbackDays = 182): RecentOrderWindowState {
  return {
    windowEndTime: nowSeconds,
    minStartTime: nowSeconds - lookbackDays * 24 * 60 * 60,
  };
}

export function getRecentOrderWindow(state: RecentOrderWindowState): { start_time: number; end_time: number } | null {
  if (state.windowEndTime < state.minStartTime) return null;
  return {
    start_time: Math.max(state.minStartTime, state.windowEndTime - RECENT_ORDER_WINDOW_SECONDS + 1),
    end_time: state.windowEndTime,
  };
}

export function moveRecentOrderWindowBack(state: RecentOrderWindowState): void {
  const current = getRecentOrderWindow(state);
  state.windowEndTime = current ? current.start_time - 1 : state.minStartTime - 1;
}
