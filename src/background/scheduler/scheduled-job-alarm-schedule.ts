const UNTIL_COMPLETE_NEXT_RUN_DELAY_MS = 1000;

export function nextUntilCompleteRunSchedule(now = Date.now()): chrome.alarms.AlarmCreateInfo {
  return { when: now + UNTIL_COMPLETE_NEXT_RUN_DELAY_MS };
}
