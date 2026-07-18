import { useState } from 'react';
import { shiftPeriod, startOfPeriod } from '../stats/period';
import { buildMonthGrid } from './monthGrid';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

interface CalendarSheetProps {
  value: string; // 현재 선택 날짜 YYYY-MM-DD
  today: string;
  dataDays: Set<string>; // 기록 있는 날
  onPick: (date: string) => void; // 부모가 점프+닫기 처리
  onClose: () => void;
}

export function CalendarSheet({ value, today, dataDays, onPick, onClose }: CalendarSheetProps) {
  const [viewMonth, setViewMonth] = useState(startOfPeriod('month', value)); // 'YYYY-MM-01'
  const grid = buildMonthGrid(viewMonth);
  // 다음 달 첫날이 오늘보다 뒤면 미래 달 — ▶ 비활성
  const nextDisabled = shiftPeriod('month', viewMonth, 1) > today;

  return (
    <div className="fixed inset-0 z-[1100] flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="rounded-t-2xl bg-white p-4 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3">
          <button
            type="button"
            onClick={() => setViewMonth(shiftPeriod('month', viewMonth, -1))}
            className="px-3 py-1 text-lg text-slate-600"
          >
            ◀
          </button>
          <span className="text-base font-bold text-slate-900">{viewMonth.slice(0, 7)}</span>
          <button
            type="button"
            onClick={() => setViewMonth(shiftPeriod('month', viewMonth, 1))}
            disabled={nextDisabled}
            className="px-3 py-1 text-lg text-slate-600 disabled:text-slate-300"
          >
            ▶
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 pb-1 text-center text-xs text-slate-400">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {grid.cells.map((cell, i) => {
            if (cell === null) return <div key={`b${i}`} />;
            const isFuture = cell > today;
            const isSelected = cell === value;
            const hasData = dataDays.has(cell);
            return (
              <button
                key={cell}
                type="button"
                disabled={isFuture}
                onClick={() => onPick(cell)}
                className={`relative flex h-10 items-center justify-center rounded-lg text-sm ${
                  isSelected
                    ? 'bg-blue-600 font-semibold text-white'
                    : isFuture
                      ? 'text-slate-300'
                      : 'text-slate-700 active:bg-slate-100'
                }`}
              >
                {Number(cell.slice(8, 10))}
                {hasData && !isSelected && (
                  <span className="absolute bottom-1 h-1 w-1 rounded-full bg-blue-500" />
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => onPick(today)}
          className="mt-4 w-full rounded-lg bg-slate-100 py-3 text-sm font-semibold text-slate-700"
        >
          오늘
        </button>
      </div>
    </div>
  );
}
