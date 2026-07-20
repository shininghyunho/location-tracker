import type { Point } from '../../db/points';
import { haversineM } from '../../lib/geo';
import { DEFAULT_STAY_PARAMS } from './stayParams';
import type { StayParams } from './stayParams';

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
      // 같은 장소라도 공백이 이어붙이기 한도를 넘으면 수집 사망으로 보고 끊는다
      // (쌓인 쪽이 유효 체류일 때만 — 미달이면 병합해 조각난 체류 소실 방지)
      const gap = Date.parse(p.ts) - Date.parse(cluster.points.at(-1)!.ts);
      if (gap > params.bridgeMaxGapMs && durationMs(cluster) >= params.minDurationMs) {
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
