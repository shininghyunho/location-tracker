import type { Stay } from '../../db/stays';
import { toDate } from '../../lib/date';

const DAY_MS = 86_400_000;

export interface PlaceSummary {
  visitCount: number;
  totalMs: number;
  // 마지막 방문 종료일 기준 며칠 전인지 — 방문 이력이 없으면 null
  lastVisitDaysAgo: number | null;
}

export function computePlaceSummary(stays: Stay[], today: string): PlaceSummary {
  const totalMs = stays.reduce(
    (sum, s) => sum + (Date.parse(s.end_ts) - Date.parse(s.start_ts)),
    0,
  );
  const lastEnd = stays.reduce<string | null>(
    (max, s) => (max === null || s.end_ts > max ? s.end_ts : max),
    null,
  );
  return {
    visitCount: stays.length,
    totalMs,
    lastVisitDaysAgo:
      lastEnd === null
        ? null
        : Math.max(
            0,
            Math.round((toDate(today).getTime() - toDate(lastEnd.slice(0, 10)).getTime()) / DAY_MS),
          ),
  };
}
