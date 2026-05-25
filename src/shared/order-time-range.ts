export interface OrderListTimeRange {
  start_time: number;
  end_time: number;
}

export const ORDER_LIST_MAX_RANGE_SECONDS = 7 * 24 * 60 * 60;

export function normalizeOrderListTimeRange(range?: Partial<OrderListTimeRange> | null): OrderListTimeRange | null {
  if (!range) return null;
  const startTime = Number(range.start_time);
  const endTime = Number(range.end_time);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
  if (startTime <= 0 || endTime < startTime) return null;
  if (endTime - startTime >= ORDER_LIST_MAX_RANGE_SECONDS) return null;
  return { start_time: startTime, end_time: endTime };
}

export function isValidOrderListTimeRange(range?: Partial<OrderListTimeRange> | null): range is OrderListTimeRange {
  return normalizeOrderListTimeRange(range) !== null;
}
