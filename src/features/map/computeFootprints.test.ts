import { describe, expect, it } from 'vitest';
import type { Stay } from '../../db/stays';
import {
  computeFootprints,
  footprintRadius,
  MAX_RADIUS_PX,
  MIN_RADIUS_PX,
} from './computeFootprints';

function stay(label: string | null, startTs: string, endTs: string, lat: number, lng: number): Stay {
  return {
    id: 1,
    start_ts: startTs,
    end_ts: endTs,
    lat,
    lng,
    label,
    source: 'collector',
    deleted: 0,
  };
}

describe('computeFootprints', () => {
  it('라벨별로 좌표를 평균 내고 체류시간을 합산해 누적 큰 순으로 정렬한다', () => {
    const fps = computeFootprints([
      stay('집', '2026-07-01T00:00:00+09:00', '2026-07-01T08:00:00+09:00', 37.0, 127.0),
      stay('집', '2026-07-02T00:00:00+09:00', '2026-07-02T04:00:00+09:00', 37.2, 127.2),
      stay('카페', '2026-07-01T14:00:00+09:00', '2026-07-01T15:00:00+09:00', 36.0, 126.0),
    ]);
    expect(fps.map((f) => f.label)).toEqual(['집', '카페']);
    expect(fps[0]).toEqual({ label: '집', lat: 37.1, lng: 127.1, totalMs: 12 * 3_600_000 });
  });

  it('라벨 없는 체류는 제외한다', () => {
    const fps = computeFootprints([
      stay(null, '2026-07-01T00:00:00+09:00', '2026-07-01T08:00:00+09:00', 37.0, 127.0),
    ]);
    expect(fps).toEqual([]);
  });
});

describe('footprintRadius', () => {
  it('최대 체류시간이면 최대 반지름, 0이면 최소 반지름이다', () => {
    expect(footprintRadius(100, 100)).toBe(MAX_RADIUS_PX);
    expect(footprintRadius(0, 100)).toBe(MIN_RADIUS_PX);
    expect(footprintRadius(0, 0)).toBe(MIN_RADIUS_PX);
  });

  it('반지름은 제곱근 스케일로 커진다', () => {
    // 1/4 지점 → sqrt(0.25)=0.5 → 7 + 21*0.5 = 17.5 → 반올림 18
    expect(footprintRadius(25, 100)).toBe(18);
  });
});
