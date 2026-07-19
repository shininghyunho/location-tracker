import { describe, expect, it } from 'vitest';
import { getStaysByDate, insertStay } from './stays';

// 자정을 넘긴 체류(본가 23:40 → 다음날 09:22)는 걸친 두 날 모두에 떠야 한다.
// 달력 점(getDatesWithData)은 이미 양일을 찍으므로, 목록만 안 뜨던 불일치를 없앤다.
describe('getStaysByDate — 걸친 날짜 모두 포함(overlap)', () => {
  it('자정 넘긴 체류는 시작일과 종료일 양쪽 화면에 뜬다', async () => {
    await insertStay({
      start_ts: '2026-07-18T23:40:00+09:00',
      end_ts: '2026-07-19T09:22:00+09:00',
      lat: 37.4048,
      lng: 126.6789,
      label: '본가',
      source: 'collector',
    });

    expect(await getStaysByDate('2026-07-18')).toHaveLength(1);
    expect(await getStaysByDate('2026-07-19')).toHaveLength(1);
    // 걸치지 않은 날은 빠진다
    expect(await getStaysByDate('2026-07-17')).toHaveLength(0);
    expect(await getStaysByDate('2026-07-20')).toHaveLength(0);
  });
});
