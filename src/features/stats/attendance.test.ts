import { describe, expect, it } from 'vitest';
import { longestStreak } from './attendance';

describe('longestStreak — 연속 방문일 최장 길이', () => {
  it('방문 없으면 0', () => {
    expect(longestStreak([])).toBe(0);
  });

  it('하루만 방문하면 1', () => {
    expect(longestStreak(['2026-05-10'])).toBe(1);
  });

  it('중간에 끊긴 구간 중 가장 긴 연속을 센다', () => {
    // 1,2,3(3연속) · 5(끊김) · 8,9(2연속) → 최장 3, 입력 순서 무관
    const days = ['2026-05-09', '2026-05-01', '2026-05-03', '2026-05-02', '2026-05-05', '2026-05-08'];
    expect(longestStreak(days)).toBe(3);
  });

  it('월말~월초 경계도 달력상 연속이면 이어 센다', () => {
    expect(longestStreak(['2026-05-30', '2026-05-31', '2026-06-01'])).toBe(3);
  });
});
