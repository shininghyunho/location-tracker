import type { Stay } from '../../db/stays';

export interface Footprint {
  label: string;
  lat: number;
  lng: number;
  totalMs: number;
}

// 라벨별 대표 좌표(평균)·누적 체류시간 — 전체 기간 지도 모드의 원 데이터. 누적 큰 순
export function computeFootprints(stays: Stay[]): Footprint[] {
  const acc = new Map<string, { lat: number; lng: number; n: number; totalMs: number }>();
  for (const s of stays) {
    if (s.label === null) continue;
    const a = acc.get(s.label) ?? { lat: 0, lng: 0, n: 0, totalMs: 0 };
    a.lat += s.lat;
    a.lng += s.lng;
    a.n++;
    a.totalMs += Date.parse(s.end_ts) - Date.parse(s.start_ts);
    acc.set(s.label, a);
  }
  return [...acc.entries()]
    .map(([label, a]) => ({ label, lat: a.lat / a.n, lng: a.lng / a.n, totalMs: a.totalMs }))
    .sort((a, b) => b.totalMs - a.totalMs);
}

export const MIN_RADIUS_PX = 7;
export const MAX_RADIUS_PX = 28;

// 넓이가 아니라 반지름을 제곱근 스케일로 — 체감 크기(넓이)가 체류시간에 비례하게
export function footprintRadius(totalMs: number, maxMs: number): number {
  if (maxMs <= 0) return MIN_RADIUS_PX;
  return Math.round(MIN_RADIUS_PX + (MAX_RADIUS_PX - MIN_RADIUS_PX) * Math.sqrt(totalMs / maxMs));
}
