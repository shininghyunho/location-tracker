import type { Stay } from '../../db/stays';
import { addDaysStr, dayStartTs } from '../../lib/date';
import { moveSegments, UNLABELED } from './computeStats';

export interface YearStatsResult {
  dayMs: Record<string, number>; // 기록 있는 날만 (YYYY-MM-DD → ms) — 잔디 농도와 '기록한 날' 수의 원천
  topPlace: { key: string; durationMs: number } | null;
  move: { count: number; distanceM: number };
  busiestMonth: { month: number; moveCount: number } | null; // month 1~12
}

export function computeYearStats(stays: Stay[], fromTs: string, toTs: string): YearStatsResult {
  const dayMs: Record<string, number> = {};
  const placeMs = new Map<string, number>();

  for (const s of stays) {
    // 경계에 걸친 stay는 기간 안쪽만 합산 — 연초·연말 밤샘 체류 이중 집계 방지(computeStats와 동일)
    const start = s.start_ts > fromTs ? s.start_ts : fromTs;
    const end = s.end_ts < toTs ? s.end_ts : toTs;
    const key = s.label ?? UNLABELED;
    placeMs.set(key, (placeMs.get(key) ?? 0) + (Date.parse(end) - Date.parse(start)));

    let date = start.slice(0, 10);
    let curMs = Date.parse(start);
    const endMs = Date.parse(end);
    while (curMs < endMs) {
      const segEnd = Math.min(endMs, Date.parse(dayStartTs(addDaysStr(date, 1))));
      dayMs[date] = (dayMs[date] ?? 0) + (segEnd - curMs);
      date = addDaysStr(date, 1);
      curMs = segEnd;
    }
  }

  // 이름 없는 장소는 여러 장소의 합산이라 대표 자리에서 밀어낸다 — 랭킹 정렬과 같은 규칙
  const top = [...placeMs.entries()].sort(
    (a, b) => Number(a[0] === UNLABELED) - Number(b[0] === UNLABELED) || b[1] - a[1],
  )[0];

  const monthlyMoves = Array<number>(12).fill(0);
  const move = { count: 0, distanceM: 0 };
  for (const seg of moveSegments(stays)) {
    move.count++;
    move.distanceM += seg.distanceM;
    monthlyMoves[Number(seg.startTs.slice(5, 7)) - 1]++;
  }
  const busiestIdx = monthlyMoves.reduce((best, n, i) => (n > monthlyMoves[best] ? i : best), 0);

  return {
    dayMs,
    topPlace: top ? { key: top[0], durationMs: top[1] } : null,
    move,
    busiestMonth:
      monthlyMoves[busiestIdx] > 0
        ? { month: busiestIdx + 1, moveCount: monthlyMoves[busiestIdx] }
        : null,
  };
}
