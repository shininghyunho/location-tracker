import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getVisitDaysByLabel } from '../../db/stays';
import { buildMonthGrid } from '../calendar/monthGrid';
import { periodRange, shiftPeriod, startOfPeriod, todayStr } from './period';
import { longestStreak } from './attendance';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function PlaceCalendar({ label }: { label: string }) {
  const today = todayStr();
  const [viewMonth, setViewMonth] = useState(() => startOfPeriod('month', today)); // 'YYYY-MM-01'
  const { fromTs, toTs } = periodRange('month', viewMonth);

  const { data: days = [] } = useQuery({
    queryKey: ['visitDays', label, viewMonth],
    queryFn: () => getVisitDaysByLabel(label, fromTs, toTs),
  });
  const visited = new Set(days);
  const grid = buildMonthGrid(viewMonth);
  // 다음 달 첫날이 오늘보다 뒤면 미래 달 — ▶ 비활성
  const nextDisabled = shiftPeriod('month', viewMonth, 1) > today;

  // 부모 <li>가 클릭으로 아코디언을 접으므로, 달력 조작이 접힘으로 이어지지 않게 전파를 막는다
  return (
    <div className="mt-3 border-t border-slate-100 pt-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between pb-2">
        <button
          type="button"
          onClick={() => setViewMonth(shiftPeriod('month', viewMonth, -1))}
          className="px-3 py-1 text-slate-500"
        >
          ◀
        </button>
        <span className="text-sm font-semibold text-slate-900">{viewMonth.slice(0, 7)}</span>
        <button
          type="button"
          onClick={() => setViewMonth(shiftPeriod('month', viewMonth, 1))}
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
      <div className="grid grid-cols-7 gap-1 text-center">
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
      <p className="pt-2 text-center text-xs text-slate-500">
        {days.length === 0
          ? '이달 방문 없음'
          : `이달 ${days.length}일 방문 · 최고 ${longestStreak(days)}일 연속`}
      </p>
    </div>
  );
}
