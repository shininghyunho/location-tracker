import type { Stay } from '../../db/stays';
import { DEFAULT_STAY_PARAMS, haversineM } from '../stays/detectStays';
import { addDaysStr, dayStartTs } from './period';

// 라벨이 실제로 이 문구와 같아도 한 묶음으로 보이는 것뿐이라 개인용 MVP에선 허용
export const UNLABELED = '이름 없는 장소';

// 3시간 초과 간격은 수집 공백(앱 꺼짐)으로 보고 이동에서 제외 — 실사용하며 조정할 설정값(설계 §3)
export const MOVE_MAX_GAP_MS = 3 * 3_600_000;

const HOUR_MS = 3_600_000;

export interface PlaceStat {
  key: string;
  durationMs: number;
  visitCount: number;
}

export interface MoveStat {
  totalMs: number;
  distanceM: number; // 직선거리(하버사인) 합
  count: number;
}

export interface StatsResult {
  places: PlaceStat[]; // durationMs 내림차순
  weekdayByPlace: Record<string, number[]>; // key → 요일별 ms (0=월 … 6=일)
  heatmap: Record<string, number[][]>; // key → [요일7][시간대24] ms
  move: MoveStat;
}

function weekdayIdx(dateStr: string): number {
  return (new Date(`${dateStr}T12:00:00`).getDay() + 6) % 7;
}

export function computeStats(stays: Stay[], fromTs: string, toTs: string): StatsResult {
  const acc = new Map<string, PlaceStat>();
  const weekdayByPlace: Record<string, number[]> = {};
  const heatmap: Record<string, number[][]> = {};

  for (const s of stays) {
    const key = s.label ?? UNLABELED;
    // 경계에 걸친 stay는 기간 안쪽만 합산 — 밤샘 체류 이중 집계 방지(설계 §3 클리핑)
    const start = s.start_ts > fromTs ? s.start_ts : fromTs;
    const end = s.end_ts < toTs ? s.end_ts : toTs;

    const stat = acc.get(key) ?? { key, durationMs: 0, visitCount: 0 };
    stat.visitCount++;
    stat.durationMs += Date.parse(end) - Date.parse(start);
    acc.set(key, stat);

    const wd = (weekdayByPlace[key] ??= Array(7).fill(0));
    const hm = (heatmap[key] ??= Array.from({ length: 7 }, () => Array(24).fill(0)));

    // 자정 경계로 쪼개 요일·시간대 칸에 누적(설계 §3)
    let date = start.slice(0, 10);
    let curMs = Date.parse(start);
    const endMs = Date.parse(end);
    while (curMs < endMs) {
      const dayStartMs = Date.parse(dayStartTs(date));
      const nextDayMs = Date.parse(dayStartTs(addDaysStr(date, 1)));
      const segEnd = Math.min(endMs, nextDayMs);
      const w = weekdayIdx(date);
      wd[w] += segEnd - curMs;
      for (let h = Math.floor((curMs - dayStartMs) / HOUR_MS); h < 24; h++) {
        const hStart = dayStartMs + h * HOUR_MS;
        if (hStart >= segEnd) break;
        hm[w][h] += Math.min(segEnd, hStart + HOUR_MS) - Math.max(curMs, hStart);
      }
      date = addDaysStr(date, 1);
      curMs = segEnd;
    }
  }

  const move: MoveStat = { totalMs: 0, distanceM: 0, count: 0 };
  for (let i = 1; i < stays.length; i++) {
    const prev = stays[i - 1];
    const next = stays[i];
    const gap = Date.parse(next.start_ts) - Date.parse(prev.end_ts);
    if (gap <= 0 || gap > MOVE_MAX_GAP_MS) continue;
    const dist = haversineM(prev.lat, prev.lng, next.lat, next.lng);
    // 반경 안 재체류는 실제 이동이 아니다 — 거리 0인데 gap만 더해져 이동시간이 부풀던 것 방지
    if (dist <= DEFAULT_STAY_PARAMS.radiusM) continue;
    move.totalMs += gap;
    move.distanceM += dist;
    move.count++;
  }

  return {
    // 이름 없는 장소는 여러 장소의 합산이라 순위가 과장됨 — 항상 맨 아래 고정
    places: [...acc.values()].sort(
      (a, b) =>
        Number(a.key === UNLABELED) - Number(b.key === UNLABELED) || b.durationMs - a.durationMs,
    ),
    weekdayByPlace,
    heatmap,
    move,
  };
}
