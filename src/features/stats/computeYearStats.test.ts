import { describe, expect, it } from 'vitest';
import { computeYearStats } from './computeYearStats';
import { UNLABELED } from './computeStats';
import type { Stay } from '../../db/stays';

const HOME = { lat: 37.4048, lng: 126.6789 };
const FAR = { lat: 37.5, lng: 126.9 }; // 약 15km — radiusM 밖 확실

const FROM = '2026-01-01T00:00:00.000+09:00';
const TO = '2027-01-01T00:00:00.000+09:00';

const HOUR = 3_600_000;

let seq = 0;
function stay(
  start_ts: string,
  end_ts: string,
  place: { lat: number; lng: number },
  label: string | null,
): Stay {
  return { id: ++seq, start_ts, end_ts, lat: place.lat, lng: place.lng, label, source: 'collector', deleted: 0 };
}

describe('computeYearStats — 잔디(dayMs)', () => {
  it('자정을 넘긴 체류는 날짜별로 나눠 쌓인다', () => {
    const s = stay('2026-03-10T23:00:00+09:00', '2026-03-11T02:00:00+09:00', HOME, '집');
    const { dayMs } = computeYearStats([s], FROM, TO);
    expect(dayMs['2026-03-10']).toBe(1 * HOUR);
    expect(dayMs['2026-03-11']).toBe(2 * HOUR);
  });

  it('연 경계에 걸친 체류는 기간 안쪽 날만 남는다', () => {
    const s = stay('2025-12-31T22:00:00+09:00', '2026-01-01T03:00:00+09:00', HOME, '집');
    const { dayMs } = computeYearStats([s], FROM, TO);
    expect(dayMs['2025-12-31']).toBeUndefined();
    expect(dayMs['2026-01-01']).toBe(3 * HOUR);
  });
});

describe('computeYearStats — 하이라이트', () => {
  it('가장 오래 머문 곳은 라벨된 장소 우선 — 이름 없는 장소는 시간이 길어도 밀린다', () => {
    const stays = [
      stay('2026-02-01T00:00:00+09:00', '2026-02-01T10:00:00+09:00', FAR, null),
      stay('2026-02-01T12:00:00+09:00', '2026-02-01T13:00:00+09:00', HOME, '집'),
    ];
    const { topPlace } = computeYearStats(stays, FROM, TO);
    expect(topPlace).toEqual({ key: '집', durationMs: 1 * HOUR });
  });

  it('라벨이 하나도 없으면 이름 없는 장소가 대표가 된다', () => {
    const s = stay('2026-02-01T00:00:00+09:00', '2026-02-01T10:00:00+09:00', FAR, null);
    expect(computeYearStats([s], FROM, TO).topPlace?.key).toBe(UNLABELED);
  });

  it('가장 바빴던 달은 이동 횟수가 최다인 달 — 이동이 없으면 null', () => {
    const stays = [
      stay('2026-03-01T09:00:00+09:00', '2026-03-01T10:00:00+09:00', HOME, '집'),
      stay('2026-03-01T10:30:00+09:00', '2026-03-01T12:00:00+09:00', FAR, '회사'),
      stay('2026-05-02T09:00:00+09:00', '2026-05-02T10:00:00+09:00', HOME, '집'),
      stay('2026-05-02T10:30:00+09:00', '2026-05-02T12:00:00+09:00', FAR, '회사'),
      stay('2026-05-02T12:30:00+09:00', '2026-05-02T14:00:00+09:00', HOME, '집'),
    ];
    const { busiestMonth, move } = computeYearStats(stays, FROM, TO);
    expect(busiestMonth).toEqual({ month: 5, moveCount: 2 });
    expect(move.count).toBe(3);
    expect(move.distanceM).toBeGreaterThan(30_000);

    expect(computeYearStats([], FROM, TO).busiestMonth).toBeNull();
  });
});
