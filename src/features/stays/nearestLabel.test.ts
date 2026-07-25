import { describe, expect, it } from 'vitest';
import { nearestLabelIn } from './nearestLabel';
import type { Stay } from '../../db/stays';

const BASE = { lat: 37.4048, lng: 126.6789 };
// 위도 1도 ≈ 111km → 0.0005도 ≈ 55m(반경 100m 안), 0.002도 ≈ 222m(밖)
const NEAR = { lat: BASE.lat + 0.0005, lng: BASE.lng };
const NEARER = { lat: BASE.lat + 0.0002, lng: BASE.lng };
const OUTSIDE = { lat: BASE.lat + 0.002, lng: BASE.lng };

let seq = 0;
function stay(place: { lat: number; lng: number }, label: string): Stay {
  return {
    id: ++seq,
    start_ts: '2026-07-25T09:00:00+09:00',
    end_ts: '2026-07-25T10:00:00+09:00',
    lat: place.lat,
    lng: place.lng,
    label,
    source: 'collector',
    deleted: 0,
  };
}

describe('nearestLabelIn — F5 라벨 자동 상속 매칭', () => {
  it('반경 안에 여러 라벨이 있으면 가장 가까운 라벨을 고른다', () => {
    const labeled = [stay(NEAR, '카페'), stay(NEARER, '집')];
    expect(nearestLabelIn(labeled, BASE.lat, BASE.lng)).toBe('집');
  });

  it('반경(100m) 밖의 라벨은 무시한다', () => {
    const labeled = [stay(OUTSIDE, '카페')];
    expect(nearestLabelIn(labeled, BASE.lat, BASE.lng)).toBeNull();
  });

  it('라벨된 체류가 없으면 null', () => {
    expect(nearestLabelIn([], BASE.lat, BASE.lng)).toBeNull();
  });

  it('거리가 같으면 먼저 온 체류의 라벨이 이긴다', () => {
    const labeled = [stay(NEAR, '먼저'), stay(NEAR, '나중')];
    expect(nearestLabelIn(labeled, BASE.lat, BASE.lng)).toBe('먼저');
  });
});
