import { useState } from 'react';
import type { TouchEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getVisitDaysByLabel } from '../../db/stays';
import { buildMonthGrid } from '../calendar/monthGrid';
import { periodRange, shiftPeriod, startOfPeriod } from './period';
import { todayStr } from '../../lib/date';
import { longestStreak } from './attendance';
import { useSwipe } from '../../lib/useSwipe';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function PlaceCalendar({ label }: { label: string }) {
  const today = todayStr();
  const [viewMonth, setViewMonth] = useState(() => startOfPeriod('month', today)); // 'YYYY-MM-01'
  // 이동 방향의 slide-in을 한 번 재생 (열릴 땐 없음)
  const [slideDir, setSlideDir] = useState<'next' | 'prev' | null>(null);
  const { fromTs, toTs } = periodRange('month', viewMonth);

  const { data: days = [] } = useQuery({
    queryKey: ['visitDays', label, viewMonth],
    queryFn: () => getVisitDaysByLabel(label, fromTs, toTs),
  });
  const visited = new Set(days);
  const grid = buildMonthGrid(viewMonth);
  // 다음 달 첫날이 오늘보다 뒤면 미래 달 — ▶·왼쪽 스와이프 차단
  const nextDisabled = shiftPeriod('month', viewMonth, 1) > today;

  const moveMonth = (delta: number) => {
    setSlideDir(delta > 0 ? 'next' : 'prev');
    setViewMonth(shiftPeriod('month', viewMonth, delta));
  };

  // 왼쪽 스와이프 = 다음 달(미래는 차단), 오른쪽 스와이프 = 이전 달
  const swipeMonth = useSwipe(
    () => {
      if (!nextDisabled) moveMonth(1);
    },
    () => moveMonth(-1),
  );
  // 통계 패널의 기간 스와이프가 달력 위 제스처를 가로채지 않게 전파를 막고, 달만 넘긴다
  const guardedSwipe = {
    onTouchStart: (e: TouchEvent) => {
      e.stopPropagation();
      swipeMonth.onTouchStart(e);
    },
    onTouchEnd: (e: TouchEvent) => {
      e.stopPropagation();
      swipeMonth.onTouchEnd(e);
    },
  };

  // 부모 <li>가 클릭으로 아코디언을 접으므로, 달력 조작이 접힘으로 이어지지 않게 전파를 막는다
  return (
    <div
      className="mt-3 border-t border-slate-100 pt-3"
      onClick={(e) => e.stopPropagation()}
      {...guardedSwipe}
    >
      <div className="flex items-center justify-between pb-2">
        <button type="button" onClick={() => moveMonth(-1)} className="px-3 py-1 text-slate-500">
          ◀
        </button>
        <span className="text-sm font-semibold text-slate-900">{viewMonth.slice(0, 7)}</span>
        <button
          type="button"
          onClick={() => moveMonth(1)}
          disabled={nextDisabled}
          className="px-3 py-1 text-slate-500 disabled:text-slate-300"
        >
          ▶
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[10px] text-slate-400">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="overflow-x-hidden">
        {/* key={viewMonth}로 remount → 달이 바뀔 때마다 이동 방향의 slide-in이 한 번 재생된다 */}
        <div
          key={viewMonth}
          className={`grid grid-cols-7 gap-1 text-center ${
            slideDir === 'next'
              ? 'animate-slide-in-right'
              : slideDir === 'prev'
                ? 'animate-slide-in-left'
                : ''
          }`}
        >
          {grid.cells.map((cell, i) => {
            if (cell === null) return <div key={`b${i}`} className="h-8" />;
            const isFuture = cell > today;
            const went = visited.has(cell);
            return (
              <div key={cell} className="flex h-8 items-center justify-center">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                    went
                      ? 'bg-blue-600 font-semibold text-white'
                      : isFuture
                        ? 'text-slate-300'
                        : 'text-slate-600'
                  }`}
                >
                  {Number(cell.slice(8, 10))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="pt-2 text-center text-xs text-slate-500">
        {days.length === 0
          ? '이달 방문 없음'
          : `이달 ${days.length}일 방문 · 최고 ${longestStreak(days)}일 연속`}
      </p>
    </div>
  );
}
