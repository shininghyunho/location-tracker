import type { Point } from '../../db/points';

// PRD §4 기본값. 하드코딩 금지 — 실사용하며 조정할 설정값
export interface StayParams {
  radiusM: number;
  minDurationMs: number;
  graceMs: number; // 반경 밖 연속 체류가 이보다 짧으면 이탈로 보지 않고 흡수(blip)
  maxAccuracyM: number; // 이보다 부정확한 점은 판정 전 제외
  // 반경 안이라도 직전 점과 이만큼 시간이 벌어지면 수집 블랙아웃(앱 꺼짐 등)으로 보고
  // 체류를 나눈다. 단 이미 쌓인 쪽이 유효 체류일 때만 — 아니면 병합해 밤샘 체류 소실 방지
  maxGapMs: number;
}

export const DEFAULT_STAY_PARAMS: StayParams = {
  radiusM: 100,
  minDurationMs: 10 * 60_000,
  graceMs: 5 * 60_000,
  maxAccuracyM: 100,
  maxGapMs: 3 * 3_600_000, // 이동 집계의 MOVE_MAX_GAP_MS와 같은 블랙아웃 정의(3h)
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
  // 정확도 나쁜 점은 판정 전 제외 — null은 정보 없음일 뿐이라 유지(구글 import 유래)
  const usable = points.filter(
    (p) => p.accuracy_m == null || p.accuracy_m <= params.maxAccuracyM,
  );
  const finalized: StayDraft[] = [];
  let cluster: Cluster | null = null;
  let outRunFirstTs: string | null = null; // 현재 연속 '밖' 구간의 첫 점 시각(없으면 null)

  for (const p of usable) {
    if (!cluster) {
      cluster = { points: [p], latSum: p.lat, lngSum: p.lng };
      continue;
    }
    const c = centroid(cluster);
    if (haversineM(c.lat, c.lng, p.lat, p.lng) <= params.radiusM) {
      outRunFirstTs = null; // 복귀 → 유예 구간 리셋
      // 반경 안이라도 직전 점과 공백이 크면 블랙아웃 — 쌓인 쪽이 유효 체류일 때만 끊는다
      // (미달이면 병합: 점 드문 밤샘 체류가 조각나 통째 사라지는 것 방지)
      const gap = Date.parse(p.ts) - Date.parse(cluster.points.at(-1)!.ts);
      if (gap > params.maxGapMs && durationMs(cluster) >= params.minDurationMs) {
        finalized.push(toDraft(cluster));
        cluster = { points: [p], latSum: p.lat, lngSum: p.lng };
        continue;
      }
      cluster.points.push(p);
      cluster.latSum += p.lat;
      cluster.lngSum += p.lng;
      continue;
    }
    // 반경 밖: 연속 이탈 시간이 grace 미만이면 blip으로 흡수(중심에 넣지 않음)
    if (outRunFirstTs === null) outRunFirstTs = p.ts;
    if (Date.parse(p.ts) - Date.parse(outRunFirstTs) < params.graceMs) continue;
    // 이탈 확정 — 클러스터를 닫고(≥minDuration이면 stay), 이 점부터 새 클러스터
    if (durationMs(cluster) >= params.minDurationMs) finalized.push(toDraft(cluster));
    cluster = { points: [p], latSum: p.lat, lngSum: p.lng };
    outRunFirstTs = null;
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
