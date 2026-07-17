import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStaysByRange } from '../../db/stays';
import {
  isCurrentPeriod,
  periodLabel,
  periodRange,
  shiftPeriod,
  startOfPeriod,
  todayStr,
} from './period';
import type { PeriodUnit } from './period';
import { computeStats } from './computeStats';

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

// 랭킹 상위 4곳은 고정 색, 나머지는 회색 '기타'(설계 §2)
const PLACE_COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500'];
const ETC_COLOR = 'bg-slate-300';

function fmtDur(ms: number): string {
  const min = Math.round(ms / 60_000);
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}시간 ${min % 60}분` : `${min}분`;
}

function Heatmap({ grid }: { grid: number[][] }) {
  const maxCell = Math.max(1, ...grid.flat());
  return (
    <div className="mt-2 flex flex-col gap-0.5">
      {grid.map((row, w) => (
        <div key={WEEKDAYS[w]} className="flex items-center gap-0.5">
          <span className="w-4 text-[10px] text-slate-400">{WEEKDAYS[w]}</span>
          {row.map((ms, h) => (
            <div
              key={h}
              className="h-3 flex-1 rounded-[2px] bg-blue-600"
              style={{ opacity: ms === 0 ? 0.08 : 0.2 + 0.8 * (ms / maxCell) }}
            />
          ))}
        </div>
      ))}
      <div className="flex justify-between pl-4 text-[10px] text-slate-400">
        <span>0시</span>
        <span>6시</span>
        <span>12시</span>
        <span>18시</span>
        <span>24시</span>
      </div>
    </div>
  );
}

export function StatsPanel({ onClose }: { onClose: () => void }) {
  const today = todayStr();
  const [unit, setUnit] = useState<PeriodUnit>('week');
  const [anchor, setAnchor] = useState(() => startOfPeriod('week', today));
  const [expanded, setExpanded] = useState<string | null>(null);

  // 단위를 바꾸면 오늘이 든 기간으로 초기화 — 주↔월 앵커는 서로 호환되지 않는다
  const changeUnit = (u: PeriodUnit) => {
    setUnit(u);
    setAnchor(startOfPeriod(u, today));
    setExpanded(null);
  };
  const moveBy = (delta: number) => {
    setAnchor(shiftPeriod(unit, anchor, delta));
    setExpanded(null);
  };

  const { fromTs, toTs } = periodRange(unit, anchor);
  const { data: stays = [] } = useQuery({
    queryKey: ['stats', fromTs, toTs],
    queryFn: () => getStaysByRange(fromTs, toTs),
  });
  const stats = useMemo(() => computeStats(stays, fromTs, toTs), [stays, fromTs, toTs]);

  const topDuration = stats.places[0]?.durationMs ?? 0;
  const colorOf = (key: string) => {
    const idx = stats.places.findIndex((p) => p.key === key);
    return idx >= 0 && idx < PLACE_COLORS.length ? PLACE_COLORS[idx] : ETC_COLOR;
  };

  // 요일 스택: 상위 장소는 각자 색 구간, 그 외는 '기타'로 합산(설계 §2)
  const weekdayBars = useMemo(() => {
    const tops = stats.places.slice(0, PLACE_COLORS.length).map((p) => p.key);
    return Array.from({ length: 7 }, (_, w) => {
      const segs = tops
        .map((key) => ({ key, ms: stats.weekdayByPlace[key]?.[w] ?? 0 }))
        .filter((seg) => seg.ms > 0);
      const etc = stats.places
        .slice(PLACE_COLORS.length)
        .reduce((sum, p) => sum + (stats.weekdayByPlace[p.key]?.[w] ?? 0), 0);
      if (etc > 0) segs.push({ key: '기타', ms: etc });
      return { segs, total: segs.reduce((sum, seg) => sum + seg.ms, 0) };
    });
  }, [stats]);
  const maxWeekday = Math.max(1, ...weekdayBars.map((b) => b.total));

  return (
    <div className="fixed inset-0 z-[1100] flex flex-col bg-slate-50 p-4">
      <header className="flex items-center justify-between pb-3 pt-6">
        <h2 className="text-lg font-bold text-slate-900">통계</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
        >
          닫기
        </button>
      </header>

      <div className="flex items-center justify-between rounded-lg bg-white p-2 shadow-sm">
        <div className="flex gap-1">
          {(['week', 'month'] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => changeUnit(u)}
              className={`rounded-md px-3 py-1 text-sm font-semibold ${
                unit === u ? 'bg-blue-600 text-white' : 'text-slate-600'
              }`}
            >
              {u === 'week' ? '주' : '월'}
            </button>
          ))}
        </div>
        <div className="flex items-center">
          <button type="button" onClick={() => moveBy(-1)} className="px-3 py-1 text-lg text-slate-600">
            ◀
          </button>
          <span className="text-sm font-semibold text-slate-900">{periodLabel(unit, anchor)}</span>
          <button
            type="button"
            onClick={() => moveBy(1)}
            disabled={isCurrentPeriod(unit, anchor, today)}
            className="px-3 py-1 text-lg text-slate-600 disabled:text-slate-300"
          >
            ▶
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3 overflow-y-auto pb-4">
        <section className="rounded-lg bg-white p-3 shadow-sm">
          <h3 className="pb-2 text-sm font-bold text-slate-900">장소 랭킹</h3>
          <ul className="flex flex-col gap-2">
            {stats.places.map((p) => (
              <li key={p.key} onClick={() => setExpanded(expanded === p.key ? null : p.key)}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold text-slate-900">{p.key}</span>
                  <span className="text-slate-500">
                    {fmtDur(p.durationMs)} · {p.visitCount}회
                  </span>
                </div>
                <div className="mt-1 h-2 rounded bg-slate-100">
                  <div
                    className={`h-2 rounded ${colorOf(p.key)}`}
                    style={{ width: `${(p.durationMs / topDuration) * 100}%` }}
                  />
                </div>
                {expanded === p.key && <Heatmap grid={stats.heatmap[p.key]} />}
              </li>
            ))}
            {stats.places.length === 0 && (
              <li className="p-4 text-center text-sm text-slate-400">이 기간의 체류 기록이 없습니다</li>
            )}
          </ul>
        </section>

        <section className="rounded-lg bg-white p-3 shadow-sm">
          <h3 className="pb-2 text-sm font-bold text-slate-900">요일별 체류</h3>
          <div className="flex h-28 items-end gap-2">
            {weekdayBars.map((bar, w) => (
              <div key={WEEKDAYS[w]} className="flex flex-1 flex-col items-center gap-1 self-end">
                <div
                  className="flex w-full flex-col-reverse overflow-hidden rounded-sm"
                  style={{ height: `${(bar.total / maxWeekday) * 96}px` }}
                >
                  {bar.segs.map((seg) => (
                    <div
                      key={seg.key}
                      className={colorOf(seg.key)}
                      style={{ height: `${(seg.ms / bar.total) * 100}%` }}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-slate-400">{WEEKDAYS[w]}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-2 text-[10px] text-slate-500">
            {stats.places.slice(0, PLACE_COLORS.length).map((p) => (
              <span key={p.key} className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-sm ${colorOf(p.key)}`} />
                {p.key}
              </span>
            ))}
            {stats.places.length > PLACE_COLORS.length && (
              <span className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-sm ${ETC_COLOR}`} />
                기타
              </span>
            )}
          </div>
        </section>

        <section className="rounded-lg bg-white p-3 text-sm text-slate-700 shadow-sm">
          <h3 className="pb-1 text-sm font-bold text-slate-900">이동</h3>
          {stats.move.count > 0 ? (
            <p>
              {stats.move.count}회 · {fmtDur(stats.move.totalMs)} ·{' '}
              {(stats.move.distanceM / 1000).toFixed(1)}km(직선)
            </p>
          ) : (
            <p className="text-slate-400">이 기간의 이동 기록이 없습니다</p>
          )}
        </section>
      </div>
    </div>
  );
}
