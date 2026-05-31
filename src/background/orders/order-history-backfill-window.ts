import { RECENT_ORDER_WINDOW_SECONDS } from './recent-order-window.ts';

export interface OrderHistoryBackfillWindowPlan {
  completed: boolean;
  minStartTime: number;
  windowStartTime?: number;
  windowEndTime?: number;
  nextCursor?: number;
}

export function planOrderHistoryBackfillWindow(input: {
  nowSeconds: number;
  lookbackDays: number;
  cursor?: number;
}): OrderHistoryBackfillWindowPlan {
  const minStartTime = input.nowSeconds - input.lookbackDays * 24 * 60 * 60;
  const windowEndTime = input.cursor ?? input.nowSeconds - RECENT_ORDER_WINDOW_SECONDS;
  if (windowEndTime < minStartTime) return { completed: true, minStartTime };
  const windowStartTime = Math.max(minStartTime, windowEndTime - RECENT_ORDER_WINDOW_SECONDS + 1);
  return {
    completed: false,
    minStartTime,
    windowStartTime,
    windowEndTime,
    nextCursor: windowStartTime - 1,
  };
}
