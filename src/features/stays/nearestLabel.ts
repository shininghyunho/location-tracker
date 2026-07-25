import type { Stay } from '../../db/stays';
import { haversineM } from '../../lib/geo';
import { DEFAULT_STAY_PARAMS } from './stayParams';

// F5 라벨 자동 상속의 매칭 규칙 단일 지점 — 반경·동률 규칙을 바꿀 땐 여기만 고친다.
// 반경은 체류판정과 같은 설정값을 공유하고, 동률이면 먼저 온 stay가 이긴다.
export function nearestLabelIn(labeled: Stay[], lat: number, lng: number): string | null {
  let best: { label: string; dist: number } | null = null;
  for (const s of labeled) {
    const dist = haversineM(lat, lng, s.lat, s.lng);
    if (dist <= DEFAULT_STAY_PARAMS.radiusM && (!best || dist < best.dist)) {
      best = { label: s.label!, dist };
    }
  }
  return best?.label ?? null;
}
