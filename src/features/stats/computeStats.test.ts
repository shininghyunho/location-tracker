import { describe, expect, it } from 'vitest';
import { computeStats, MOVE_MAX_GAP_MS, UNLABELED } from './computeStats';
import type { Stay } from '../../db/stays';

const HOME = { lat: 37.4048, lng: 126.6789 };
const FAR = { lat: 37.5, lng: 126.9 }; // 약 15km — radiusM 밖 확실

// 2026-07-13(월)~07-20 자정 배타 — 주간 기간과 동일한 형태
const FROM = '2026-07-13T00:00:00.000+09:00';
const TO = '2026-07-20T00:00:00.000+09:00';

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

describe('computeStats — 기간 경계 클리핑', () => {
  it('기간 시작 전에 시작한 체류는 기간 안쪽만 합산한다', () => {
    const s = stay('2026-07-12T22:00:00+09:00', '2026-07-13T02:00:00+09:00', HOME, '집');
    const { places, weekdayByPlace } = computeStats([s], FROM, TO);
    expect(places[0].durationMs).toBe(2 * HOUR);
    // 기간 밖 일요일(7/12) 몫은 버려지고 월요일에만 쌓인다
    expect(weekdayByPlace['집'][0]).toBe(2 * HOUR);
    expect(weekdayByPlace['집'][6]).toBe(0);
  });

  it('기간 끝을 넘는 체류는 끝 자정에서 잘린다', () => {
    const s = stay('2026-07-19T22:00:00+09:00', '2026-07-20T03:00:00+09:00', HOME, '집');
    const { places } = computeStats([s], FROM, TO);
    expect(places[0].durationMs).toBe(2 * HOUR);
  });
});

describe('computeStats — 자정 분할과 히트맵 배분', () => {
  it('자정을 넘긴 체류는 요일별로 나눠 쌓인다', () => {
    const s = stay('2026-07-13T23:00:00+09:00', '2026-07-14T01:00:00+09:00', HOME, '집');
    const { weekdayByPlace, heatmap } = computeStats([s], FROM, TO);
    expect(weekdayByPlace['집'][0]).toBe(1 * HOUR); // 월 23시대
    expect(weekdayByPlace['집'][1]).toBe(1 * HOUR); // 화 0시대
    expect(heatmap['집'][0][23]).toBe(1 * HOUR);
    expect(heatmap['집'][1][0]).toBe(1 * HOUR);
  });

  it('시간대 중간에 걸친 구간은 칸별로 부분 배분되고 합이 총 시간과 같다', () => {
    const s = stay('2026-07-13T10:30:00+09:00', '2026-07-13T12:15:00+09:00', HOME, '집');
    const { heatmap, places } = computeStats([s], FROM, TO);
    const mon = heatmap['집'][0];
    expect(mon[10]).toBe(0.5 * HOUR);
    expect(mon[11]).toBe(1 * HOUR);
    expect(mon[12]).toBe(0.25 * HOUR);
    expect(mon.reduce((a, b) => a + b, 0)).toBe(places[0].durationMs);
  });
});

describe('computeStats — 장소 랭킹', () => {
  it('체류 시간 내림차순으로 정렬하고 방문 횟수를 센다', () => {
    const stays = [
      stay('2026-07-13T09:00:00+09:00', '2026-07-13T10:00:00+09:00', FAR, '회사'),
      stay('2026-07-13T12:00:00+09:00', '2026-07-13T15:00:00+09:00', HOME, '집'),
      stay('2026-07-14T09:00:00+09:00', '2026-07-14T10:00:00+09:00', FAR, '회사'),
    ];
    const { places } = computeStats(stays, FROM, TO);
    expect(places.map((p) => p.key)).toEqual(['집', '회사']);
    expect(places[1].visitCount).toBe(2);
    expect(places[1].durationMs).toBe(2 * HOUR);
  });

  it('이름 없는 장소는 시간이 가장 길어도 맨 아래로 고정된다', () => {
    const stays = [
      stay('2026-07-13T00:00:00+09:00', '2026-07-13T10:00:00+09:00', FAR, null),
      stay('2026-07-13T12:00:00+09:00', '2026-07-13T13:00:00+09:00', HOME, '집'),
    ];
    const { places } = computeStats(stays, FROM, TO);
    expect(places.at(-1)!.key).toBe(UNLABELED);
  });
});

describe('computeStats — 이동 요약', () => {
  it('다른 장소로의 이동은 간격과 직선거리를 합산한다', () => {
    const stays = [
      stay('2026-07-13T09:00:00+09:00', '2026-07-13T12:00:00+09:00', HOME, '집'),
      stay('2026-07-13T12:30:00+09:00', '2026-07-13T18:00:00+09:00', FAR, '회사'),
    ];
    const { move } = computeStats(stays, FROM, TO);
    expect(move.count).toBe(1);
    expect(move.totalMs).toBe(0.5 * HOUR);
    expect(move.distanceM).toBeGreaterThan(10_000);
  });

  it('수집 공백(3시간 초과)은 이동으로 치지 않는다', () => {
    const stays = [
      stay('2026-07-13T09:00:00+09:00', '2026-07-13T10:00:00+09:00', HOME, '집'),
      stay(
        new Date(Date.parse('2026-07-13T10:00:00+09:00') + MOVE_MAX_GAP_MS + 60_000).toISOString(),
        '2026-07-13T18:00:00+09:00',
        FAR,
        '회사',
      ),
    ];
    const { move } = computeStats(stays, FROM, TO);
    expect(move.count).toBe(0);
  });

  it('반경 안 재체류(같은 장소)는 이동으로 치지 않는다', () => {
    const stays = [
      stay('2026-07-13T09:00:00+09:00', '2026-07-13T12:00:00+09:00', HOME, '집'),
      stay('2026-07-13T12:30:00+09:00', '2026-07-13T14:00:00+09:00', HOME, '집'),
    ];
    const { move } = computeStats(stays, FROM, TO);
    expect(move.count).toBe(0);
  });
});
