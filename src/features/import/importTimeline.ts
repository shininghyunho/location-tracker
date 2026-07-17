import { batchInsertPoints, getFirstCollectorPointTs } from '../../db/points';
import { batchInsertStays, getAllStays } from '../../db/stays';
import type { Stay } from '../../db/stays';
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
  const stays = cutoff ? parsed.stays.filter((s) => s.end_ts <= cutoff) : parsed.stays;

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
