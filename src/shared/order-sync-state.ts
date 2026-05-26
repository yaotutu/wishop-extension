export interface OrderSyncFinishedState {
  lastFinishedAt?: number;
  accountStates?: Array<{ lastFinishedAt?: number }>;
}

export function latestOrderSyncFinishedAt(state?: OrderSyncFinishedState | null): number | undefined {
  if (!state) return undefined;
  const finishedTimes = [
    state.lastFinishedAt,
    ...(state.accountStates || []).map(item => item.lastFinishedAt),
  ].filter((value): value is number => typeof value === 'number' && value > 0);
  return finishedTimes.length > 0 ? Math.max(...finishedTimes) : undefined;
}
