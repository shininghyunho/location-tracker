import type { Point } from '../../db/points';

export interface StayWindow {
  startTs: string;
  endTs: string;
  lat: number;
  lng: number;
}

// 앱의 핵심은 체류지 — 체류 중 GPS 지터는 정확도가 좋아도 수십 m 산포라 낙서 뭉치를 그린다.
// 체류 창 안의 점을 전부 빼고 체류 대표 좌표(마커와 같은 스냅 좌표) 한 점으로 치환해
// 선이 이동 구간만 그리며 마커를 지나가게 한다. 표시 전용 — DB·판정 무변경
export function collapseStayWindows(
  points: Point[],
  windows: StayWindow[],
): { lat: number; lng: number }[] {
  const moving = points.filter(
    (p) => !windows.some((w) => w.startTs <= p.ts && p.ts <= w.endTs),
  );
  return [
    ...moving.map((p) => ({ ts: p.ts, lat: p.lat, lng: p.lng })),
    ...windows.map((w) => ({ ts: w.startTs, lat: w.lat, lng: w.lng })),
  ]
    .sort((a, b) => (a.ts < b.ts ? -1 : 1))
    .map(({ lat, lng }) => ({ lat, lng }));
}
