import { describe, expect, it } from 'vitest';
import { getAllStays, insertStay } from './stays';

// 진행 중 카드의 '수정'은 insertStay가 돌려준 id로 곧바로 라벨 시트를 연다 —
// 반환값이 실제 삽입된 row를 가리켜야 한다.
describe('insertStay — 삽입한 row의 id를 반환한다', () => {
  it('반환한 id로 방금 넣은 체류를 찾을 수 있다', async () => {
    const id = await insertStay({
      start_ts: '2026-07-19T14:00:00+09:00',
      end_ts: '2026-07-19T14:30:00+09:00',
      lat: 37.4048,
      lng: 126.6789,
      label: null,
      source: 'collector',
    });

    expect(id).toBeGreaterThan(0);
    const stays = await getAllStays();
    expect(stays.find((s) => s.id === id)).toBeDefined();
  });
});
