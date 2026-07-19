import { describe, expect, it } from 'vitest';
import { recomputeStays } from './useDayTimeline';
import { insertPoint } from '../../db/points';
import { getAllStays, insertStay } from '../../db/stays';

const HOME = { lat: 37.4048, lng: 126.6789 };

// 실제 버그 재현: 이미 확정 저장된 본가 체류(23:40~00:15) 뒤 밤샘 블랙아웃,
// 아침에 같은 장소에서 다시 점이 잡힌다. 증분 판정이 이걸 이어붙여야 한다.
describe('recomputeStays — 저장된 체류를 블랙아웃 너머로 이어붙인다', () => {
  it('공백 뒤 같은 장소 재수집이면 새 체류를 만들지 않고 직전 체류 end_ts를 연장한다', async () => {
    await insertStay({
      start_ts: '2026-07-18T23:40:35+09:00',
      end_ts: '2026-07-19T00:15:26+09:00',
      lat: HOME.lat,
      lng: HOME.lng,
      label: '본가',
      source: 'collector',
    });
    for (const ts of [
      '2026-07-19T08:00:29+09:00',
      '2026-07-19T09:12:36+09:00',
      '2026-07-19T09:21:02+09:00',
      '2026-07-19T09:22:47+09:00',
    ]) {
      await insertPoint({ ts, lat: HOME.lat, lng: HOME.lng, accuracy_m: 15, source: 'collector' });
    }

    const ongoing = await recomputeStays();

    const stays = await getAllStays();
    // 같은 장소 하나의 체류로 유지 — 병렬 본가 체류가 생기면 안 된다
    expect(stays).toHaveLength(1);
    expect(stays[0].label).toBe('본가');
    expect(stays[0].end_ts).toBe('2026-07-19T09:22:47+09:00');
    // 저장된 체류로 흡수됐으니 진행중 체류를 따로 보고하지 않는다(중복 표시 방지)
    expect(ongoing).toBeNull();
  });
});
