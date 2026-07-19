import { describe, expect, it } from 'vitest';
import { countStaysByLabel, insertStay, relabelByName } from './stays';

// 스크린샷 재현: 좌표가 다른 두 '맥날' 체류를 한 번에 '스카'로 통일한다.
// 기존 relabelNearbyUnlabeled는 라벨 있는 것을 건너뛰어 1건만 바뀌던 버그.
describe('relabelByName — 이름 기준 일괄 변경', () => {
  it('같은 이름 체류를 좌표와 무관하게 모두 바꾼다', async () => {
    await insertStay({
      start_ts: '2026-05-26T14:00:00+09:00',
      end_ts: '2026-05-26T18:35:00+09:00',
      lat: 37.59345,
      lng: 127.07546,
      label: '맥날',
      source: 'collector',
    });
    await insertStay({
      start_ts: '2026-05-26T19:21:00+09:00',
      end_ts: '2026-05-26T22:38:00+09:00',
      lat: 37.5,
      lng: 127.0,
      label: '맥날',
      source: 'collector',
    });

    expect(await countStaysByLabel('맥날')).toBe(2);

    await relabelByName('맥날', '스카');

    expect(await countStaysByLabel('맥날')).toBe(0);
    expect(await countStaysByLabel('스카')).toBe(2);
  });
});
