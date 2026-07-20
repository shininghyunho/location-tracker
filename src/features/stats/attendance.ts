import { addDaysStr } from '../../lib/date';

// 방문일 목록에서 연속된 날의 최장 길이 — 하루라도 비면 끊긴다
export function longestStreak(days: string[]): number {
  if (days.length === 0) return 0;
  const sorted = [...days].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = addDaysStr(sorted[i - 1], 1) === sorted[i] ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}
