import { describe, expect, it } from 'vitest';
import { canCall, mergeSuggestions, normalizeQuota } from './placeSuggest';
import type { KakaoPlaceDoc } from './placeSuggest';

function doc(id: string, name: string, distance: string, category = '음식점 > 한식'): KakaoPlaceDoc {
  return { id, place_name: name, distance, category_name: category };
}

describe('mergeSuggestions', () => {
  it('카테고리 배치를 거리순으로 합치고 상위 5개만 남긴다', () => {
    const merged = mergeSuggestions([
      [doc('1', '식당A', '40'), doc('2', '식당B', '15')],
      [doc('3', '카페C', '10', '음식점 > 카페 > 디저트카페'), doc('4', '카페D', '90')],
      [doc('5', '마트E', '60'), doc('6', '마트F', '70')],
    ]);
    expect(merged.map((p) => p.name)).toEqual(['카페C', '식당B', '식당A', '마트E', '마트F']);
    expect(merged[0]).toEqual({ name: '카페C', distanceM: 10, category: '디저트카페' });
  });

  it('같은 장소 id는 한 번만 남긴다', () => {
    const merged = mergeSuggestions([[doc('1', '식당A', '40')], [doc('1', '식당A', '40')]]);
    expect(merged).toHaveLength(1);
  });
});

describe('quota', () => {
  it('날짜가 바뀌면 사용량과 차단이 리셋된다', () => {
    const y = { date: '2026-07-24', used: 99, blocked: true };
    expect(normalizeQuota(y, '2026-07-25')).toEqual({ date: '2026-07-25', used: 0, blocked: false });
    expect(normalizeQuota(null, '2026-07-25')).toEqual({
      date: '2026-07-25',
      used: 0,
      blocked: false,
    });
  });

  it('상한을 넘기거나 차단된 날은 호출을 막는다', () => {
    const base = { date: '2026-07-25', used: 0, blocked: false };
    expect(canCall(base, 8, 100)).toBe(true);
    expect(canCall({ ...base, used: 92 }, 8, 100)).toBe(true);
    expect(canCall({ ...base, used: 93 }, 8, 100)).toBe(false);
    expect(canCall({ ...base, blocked: true }, 8, 100)).toBe(false);
  });
});
