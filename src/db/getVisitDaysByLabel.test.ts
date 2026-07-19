import { describe, expect, it } from 'vitest';
import { getVisitDaysByLabel, insertStay } from './stays';

const MAY = { from: '2026-05-01T00:00:00.000+09:00', to: '2026-06-01T00:00:00.000+09:00' };

describe('getVisitDaysByLabel — 라벨별 방문일', () => {
  it('해당 라벨만, 그 달 안의 방문일만 중복 없이 돌려준다', async () => {
    // 헬스장 2일(같은 날 2회는 하루로) + 자정 넘긴 체류 + 다른 라벨 + 인접 달 stay
    await insertStay({ start_ts: '2026-05-02T07:00:00+09:00', end_ts: '2026-05-02T08:00:00+09:00', lat: 37.5, lng: 127, label: '헬스장', source: 'collector' });
    await insertStay({ start_ts: '2026-05-02T19:00:00+09:00', end_ts: '2026-05-02T20:00:00+09:00', lat: 37.5, lng: 127, label: '헬스장', source: 'collector' });
    await insertStay({ start_ts: '2026-05-10T07:00:00+09:00', end_ts: '2026-05-10T08:00:00+09:00', lat: 37.5, lng: 127, label: '헬스장', source: 'collector' });
    // 자정 넘긴 체류: 두 날 모두 방문으로
    await insertStay({ start_ts: '2026-05-20T23:30:00+09:00', end_ts: '2026-05-21T00:30:00+09:00', lat: 37.5, lng: 127, label: '헬스장', source: 'collector' });
    // 다른 라벨 — 제외
    await insertStay({ start_ts: '2026-05-15T10:00:00+09:00', end_ts: '2026-05-15T11:00:00+09:00', lat: 37.6, lng: 127, label: '직장', source: 'collector' });
    // 4월 말~5월 걸침 — 5월 부분만 집계
    await insertStay({ start_ts: '2026-04-30T23:00:00+09:00', end_ts: '2026-05-01T01:00:00+09:00', lat: 37.5, lng: 127, label: '헬스장', source: 'collector' });

    const days = (await getVisitDaysByLabel('헬스장', MAY.from, MAY.to)).sort();

    expect(days).toEqual(['2026-05-01', '2026-05-02', '2026-05-10', '2026-05-20', '2026-05-21']);
  });
});
