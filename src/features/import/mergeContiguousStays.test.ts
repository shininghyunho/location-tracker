import { describe, expect, it } from 'vitest';
import { mergeContiguousStays } from './importTimeline';
import type { NewStay } from '../../db/stays';

const BASE = { lat: 37.4048, lng: 126.6789 };
// 0.002도 ≈ 222m — 병합 반경(100m) 밖
const FAR = { lat: BASE.lat + 0.002, lng: BASE.lng };

function stay(start_ts: string, end_ts: string, place = BASE): NewStay {
  return { start_ts, end_ts, lat: place.lat, lng: place.lng, label: null, source: 'import' };
}

describe('mergeContiguousStays — 같은 장소의 연속 visit 병합', () => {
  it('60초 이내 갭의 같은 장소 stay는 하나로 합치고 end_ts를 늘린다', () => {
    const merged = mergeContiguousStays([
      stay('2026-07-25T09:00:00.000+09:00', '2026-07-25T10:00:00.000+09:00'),
      stay('2026-07-25T10:00:30.000+09:00', '2026-07-25T11:00:00.000+09:00'),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].start_ts).toBe('2026-07-25T09:00:00.000+09:00');
    expect(merged[0].end_ts).toBe('2026-07-25T11:00:00.000+09:00');
  });

  it('갭이 60초를 넘으면 별개 stay로 남긴다 (나갔다 온 건 별개 체류)', () => {
    const merged = mergeContiguousStays([
      stay('2026-07-25T09:00:00.000+09:00', '2026-07-25T10:00:00.000+09:00'),
      stay('2026-07-25T10:02:00.000+09:00', '2026-07-25T11:00:00.000+09:00'),
    ]);
    expect(merged).toHaveLength(2);
  });

  it('시간이 붙어 있어도 반경(100m) 밖이면 병합하지 않는다', () => {
    const merged = mergeContiguousStays([
      stay('2026-07-25T09:00:00.000+09:00', '2026-07-25T10:00:00.000+09:00'),
      stay('2026-07-25T10:00:30.000+09:00', '2026-07-25T11:00:00.000+09:00', FAR),
    ]);
    expect(merged).toHaveLength(2);
  });

  it('입력 순서가 뒤섞여도 start_ts 기준으로 정렬해 병합한다', () => {
    const merged = mergeContiguousStays([
      stay('2026-07-25T10:00:30.000+09:00', '2026-07-25T11:00:00.000+09:00'),
      stay('2026-07-25T09:00:00.000+09:00', '2026-07-25T10:00:00.000+09:00'),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].end_ts).toBe('2026-07-25T11:00:00.000+09:00');
  });

  it('앞 stay에 통째로 포함된 stay는 end_ts를 줄이지 않는다', () => {
    const merged = mergeContiguousStays([
      stay('2026-07-25T09:00:00.000+09:00', '2026-07-25T12:00:00.000+09:00'),
      stay('2026-07-25T09:30:00.000+09:00', '2026-07-25T10:00:00.000+09:00'),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].end_ts).toBe('2026-07-25T12:00:00.000+09:00');
  });

  it('원본 배열과 요소를 변형하지 않는다', () => {
    const first = stay('2026-07-25T09:00:00.000+09:00', '2026-07-25T10:00:00.000+09:00');
    const input = [first, stay('2026-07-25T10:00:30.000+09:00', '2026-07-25T11:00:00.000+09:00')];
    mergeContiguousStays(input);
    expect(input).toHaveLength(2);
    expect(first.end_ts).toBe('2026-07-25T10:00:00.000+09:00');
  });
});
