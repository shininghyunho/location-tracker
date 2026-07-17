import { batchInsertPoints, getFirstCollectorPointTs } from '../../db/points';
import { batchInsertStays, getAllStays } from '../../db/stays';
import type { NewStay, Stay } from '../../db/stays';
import { DEFAULT_STAY_PARAMS, haversineM } from '../stays/detectStays';
import { parseTimeline } from './parseTimeline';

export interface ImportProgress {
  done: number;
  total: number;
}

// 개수는 실제 추가된 행 수 — 재-import면 0이 된다
export interface ImportResult {
  pointCount: number;
  stayCount: number;
}

// stay마다 findNearestLabel(매번 전체 DB 조회)을 부르면 수천 번 반복되므로
// 라벨 있는 stay를 한 번만 로드해 메모리에서 최근접을 찾는다
function nearestLabel(labeled: Stay[], lat: number, lng: number): string | null {
  let best: { label: string; dist: number } | null = null;
  for (const s of labeled) {
    const dist = haversineM(lat, lng, s.lat, s.lng);
    if (dist <= DEFAULT_STAY_PARAMS.radiusM && (!best || dist < best.dist)) {
      best = { label: s.label!, dist };
    }
  }
  return best?.label ?? null;
}

// 구글이 같은 장소의 연속 체류를 visit 여러 개로 쪼개 줄 때가 있어 하나로 합친다.
// 사이에 이동 세그먼트가 있으면 시간이 붙어 있지 않아 병합되지 않는다 (나갔다 온 건 별개 체류 유지)
const MERGE_MAX_GAP_MS = 60_000;

function mergeContiguousStays(stays: NewStay[]): NewStay[] {
  const sorted = [...stays].sort((a, b) => (a.start_ts < b.start_ts ? -1 : 1));
  const merged: NewStay[] = [];
  for (const s of sorted) {
    const prev = merged.at(-1);
    if (
      prev &&
      Date.parse(s.start_ts) - Date.parse(prev.end_ts) <= MERGE_MAX_GAP_MS &&
      haversineM(prev.lat, prev.lng, s.lat, s.lng) <= DEFAULT_STAY_PARAMS.radiusM
    ) {
      if (s.end_ts > prev.end_ts) prev.end_ts = s.end_ts;
      continue;
    }
    merged.push({ ...s });
  }
  return merged;
}

export async function importTimeline(
  file: File,
  onProgress: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const parsed = parseTimeline(JSON.parse(await file.text()));
  if (parsed.stays.length + parsed.points.length === 0) {
    throw new Error('timeline.json 형식이 아니거나 읽을 항목이 없음');
  }

  // 설치 이전만 백필 — 설치 순간에 걸친 stay는 collector stay와 겹쳐 보이므로 통째로 버린다
  const cutoff = await getFirstCollectorPointTs();
  const points = cutoff ? parsed.points.filter((p) => p.ts < cutoff) : parsed.points;
  const mergedStays = mergeContiguousStays(parsed.stays);
  const stays = cutoff ? mergedStays.filter((s) => s.end_ts <= cutoff) : mergedStays;

  const labeled = (await getAllStays()).filter((s) => s.label !== null);
  for (const s of stays) s.label = nearestLabel(labeled, s.lat, s.lng);

  const total = points.length + stays.length;
  let done = 0;
  const onChunk = (n: number) => {
    done += n;
    onProgress({ done, total });
  };
  const pointCount = await batchInsertPoints(points, onChunk);
  const stayCount = await batchInsertStays(stays, onChunk);
  return { pointCount, stayCount };
}
