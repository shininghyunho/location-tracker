import type { Point } from '../../db/points';

// PRD §4 기본값. 하드코딩 금지 — 실사용하며 조정할 설정값
export interface StayParams {
  radiusM: number;
  minDurationMs: number;
}

export const DEFAULT_STAY_PARAMS: StayParams = {
  radiusM: 100,
  minDurationMs: 10 * 60_000,
};

export interface StayDraft {
  startTs: string;
  endTs: string;
  lat: number;
  lng: number;
  pointCount: number;
}

export interface DetectResult {
  finalized: StayDraft[]; // 클러스터를 벗어나 확정된 체류
  ongoing: StayDraft | null; // 마지막 클러스터가 T를 넘겼지만 아직 벗어나지 않음 (저장하지 않는다)
}

interface Cluster {
  points: Point[];
  latSum: number;
  lngSum: number;
}

function centroid(c: Cluster): { lat: number; lng: number } {
  return { lat: c.latSum / c.points.length, lng: c.lngSum / c.points.length };
}

function durationMs(c: Cluster): number {
  return Date.parse(c.points.at(-1)!.ts) - Date.parse(c.points[0].ts);
}

function toDraft(c: Cluster): StayDraft {
  const { lat, lng } = centroid(c);
  return {
    startTs: c.points[0].ts,
    endTs: c.points.at(-1)!.ts,
    lat,
    lng,
    pointCount: c.points.length,
  };
}

// PRD §4 체류지 판정: 시간순 points를 훑으며 중심 반경 D 이내면 같은 클러스터,
// 벗어나면 클러스터를 닫고 (체류시간 ≥ T일 때만 stay로 확정) 새 클러스터 시작
export function detectStays(points: Point[], params: StayParams = DEFAULT_STAY_PARAMS): DetectResult {
  const finalized: StayDraft[] = [];
  let cluster: Cluster | null = null;

  for (const p of points) {
    if (cluster) {
      const c = centroid(cluster);
      if (haversineM(c.lat, c.lng, p.lat, p.lng) <= params.radiusM) {
        cluster.points.push(p);
        cluster.latSum += p.lat;
        cluster.lngSum += p.lng;
        continue;
      }
      if (durationMs(cluster) >= params.minDurationMs) finalized.push(toDraft(cluster));
    }
    cluster = { points: [p], latSum: p.lat, lngSum: p.lng };
  }

  const ongoing =
    cluster && durationMs(cluster) >= params.minDurationMs ? toDraft(cluster) : null;
  return { finalized, ongoing };
}

// 두 좌표 사이 거리(미터). 지구를 구로 근사한 하버사인 공식
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
