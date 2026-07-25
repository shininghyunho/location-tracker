import { describe, expect, it } from 'vitest';
import { computePlaceSummary } from './placeSummary';
import type { Stay } from '../../db/stays';

const HOUR = 3_600_000;

let seq = 0;
function stay(start_ts: string, end_ts: string): Stay {
  return {
    id: ++seq,
    start_ts,
    end_ts,
    lat: 37.4,
    lng: 126.6,
    label: '집',
    source: 'collector',
    deleted: 0,
  };
}

describe('computePlaceSummary', () => {
  it('방문 횟수와 총 체류 시간을 합산한다 — 자정 넘긴 체류도 통으로', () => {
    const stays = [
      stay('2026-07-10T09:00:00+09:00', '2026-07-10T12:00:00+09:00'),
      stay('2026-07-18T23:00:00+09:00', '2026-07-19T02:00:00+09:00'),
    ];
    const s = computePlaceSummary(stays, '2026-07-25');
    expect(s.visitCount).toBe(2);
    expect(s.totalMs).toBe(6 * HOUR);
  });

  it('마지막 방문은 종료 시각이 가장 늦은 체류의 날짜 기준', () => {
    const stays = [
      stay('2026-07-19T14:00:00+09:00', '2026-07-19T17:00:00+09:00'),
      stay('2026-07-10T09:00:00+09:00', '2026-07-10T12:00:00+09:00'),
    ];
    expect(computePlaceSummary(stays, '2026-07-25').lastVisitDaysAgo).toBe(6);
    expect(computePlaceSummary(stays, '2026-07-19').lastVisitDaysAgo).toBe(0);
  });

  it('방문 이력이 없으면 lastVisitDaysAgo는 null', () => {
    const s = computePlaceSummary([], '2026-07-25');
    expect(s).toEqual({ visitCount: 0, totalMs: 0, lastVisitDaysAgo: null });
  });
});
