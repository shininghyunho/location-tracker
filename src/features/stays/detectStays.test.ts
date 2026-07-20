import { describe, expect, it } from 'vitest';
import { detectStays } from './detectStays';
import { DEFAULT_STAY_PARAMS } from './stayParams';
import type { Point } from '../../db/points';

// 본가 좌표, 그리고 반경 밖으로 확실히 벗어난 좌표(약 15km)
const HOME = { lat: 37.4048, lng: 126.6789 };
const FAR = { lat: 37.5, lng: 126.9 };

let seq = 0;
function pt(ts: string, place: { lat: number; lng: number }, acc = 5): Point {
  return { id: ++seq, ts, lat: place.lat, lng: place.lng, accuracy_m: acc, source: 'collector' };
}

// 수집 블랙아웃(정지 중 GPS off)을 사이에 둔 같은 장소 점들.
// gapH 시간만큼 벌어진 뒤 다시 같은 장소에서 잡힌 상황을 만든다.
function homeWithBlackout(gapH: number): Point[] {
  return [
    pt('2026-07-18T23:40:00+09:00', HOME),
    pt('2026-07-18T23:50:00+09:00', HOME),
    pt('2026-07-19T00:00:00+09:00', HOME),
    pt('2026-07-19T00:10:00+09:00', HOME),
    // 여기서 gapH 시간 블랙아웃 후 같은 장소에서 재수집
    pt(new Date(Date.parse('2026-07-19T00:10:00+09:00') + gapH * 3_600_000).toISOString(), HOME),
    pt(new Date(Date.parse('2026-07-19T00:20:00+09:00') + gapH * 3_600_000).toISOString(), HOME),
    pt(new Date(Date.parse('2026-07-19T00:30:00+09:00') + gapH * 3_600_000).toISOString(), HOME),
  ];
}

describe('detectStays — 정지 중 수집 블랙아웃 처리', () => {
  it('같은 장소에서 밤샘 공백(약 8h) 뒤 재수집되면 한 체류로 이어붙인다', () => {
    const { finalized, ongoing } = detectStays(homeWithBlackout(8));
    // 공백을 경계로 쪼개지 않는다 — 계속 머문 하나의 체류
    expect(finalized).toHaveLength(0);
    expect(ongoing).not.toBeNull();
    expect(ongoing!.startTs).toBe('2026-07-18T23:40:00+09:00');
  });

  it('공백이 이어붙이기 한도(bridgeMaxGapMs)를 넘으면(약 20h) 별도 체류로 나눈다', () => {
    const { finalized } = detectStays(homeWithBlackout(20));
    // 하루 넘게 데이터가 없으면 수집 자체가 죽은 것으로 보고 연속 주장하지 않는다
    expect(finalized).toHaveLength(1);
    expect(finalized[0].startTs).toBe('2026-07-18T23:40:00+09:00');
  });

  it('공백 뒤 다른 장소면(반경 밖) 당연히 새 체류로 나눈다', () => {
    const pts = [
      pt('2026-07-18T23:40:00+09:00', HOME),
      pt('2026-07-18T23:50:00+09:00', HOME),
      pt('2026-07-19T00:00:00+09:00', HOME),
      pt('2026-07-19T00:10:00+09:00', HOME),
      // 8시간 뒤 먼 곳에서 두 점(유예 초과) — 이탈 확정
      pt('2026-07-19T08:10:00+09:00', FAR),
      pt('2026-07-19T08:20:00+09:00', FAR),
    ];
    const { finalized } = detectStays(pts);
    expect(finalized).toHaveLength(1);
    expect(finalized[0].lat).toBeCloseTo(HOME.lat, 3);
  });

  it('bridgeMaxGapMs 기본값은 밤샘을 덮되 하루 미만이다', () => {
    expect(DEFAULT_STAY_PARAMS.bridgeMaxGapMs).toBeGreaterThanOrEqual(12 * 3_600_000);
    expect(DEFAULT_STAY_PARAMS.bridgeMaxGapMs).toBeLessThan(24 * 3_600_000);
  });
});
