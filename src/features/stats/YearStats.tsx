import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Stay } from '../../db/stays';
import { getLabelFirstVisits } from '../../db/stays';
import { addDaysStr, toDate } from '../../lib/date';
import { computeYearStats } from './computeYearStats';

const HOUR_MS = 3_600_000;
const MONTH_AXIS = ['1월', '4월', '7월', '10월', '12월'];

// 연 단위에선 분까지 쓰면 길어 시간으로 반올림 — 시안의 '4,210시간' 표기
function fmtHours(ms: number): string {
  return `${Math.round(ms / HOUR_MS).toLocaleString()}시간`;
}

function Highlight({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-slate-100 px-2.5 py-2">
      <div className="text-[10px] text-slate-500">{k}</div>
      <div className="text-sm font-extrabold tabular-nums text-slate-900">{v}</div>
    </div>
  );
}

interface YearStatsProps {
  stays: Stay[];
  fromTs: string;
  toTs: string;
}

export function YearStats({ stays, fromTs, toTs }: YearStatsProps) {
  const year = fromTs.slice(0, 4);
  const stats = useMemo(() => computeYearStats(stays, fromTs, toTs), [stays, fromTs, toTs]);
  const { data: firstVisits = {} } = useQuery({
    queryKey: ['stats', 'firstVisits'],
    queryFn: getLabelFirstVisits,
  });
  const newPlaceCount = Object.values(firstVisits).filter((t) => t >= fromTs && t < toTs).length;

  // GitHub 잔디와 같은 열=주(월요일 시작) 배치 — 1월 1일 요일만큼 첫 열 위를 비운다
  const weeks = useMemo(() => {
    const lead = (toDate(`${year}-01-01`).getDay() + 6) % 7;
    const cols: ({ date: string; ms: number } | null)[][] = [];
    let i = 0;
    for (let d = `${year}-01-01`; d.slice(0, 4) === year; d = addDaysStr(d, 1), i++) {
      (cols[Math.floor((i + lead) / 7)] ??= Array(7).fill(null))[(i + lead) % 7] = {
        date: d,
        ms: stats.dayMs[d] ?? 0,
      };
    }
    return cols;
  }, [year, stats]);
  const maxDay = Math.max(1, ...Object.values(stats.dayMs));
  const recordedDays = Object.keys(stats.dayMs).length;

  return (
    <>
      <section className="rounded-lg bg-white p-3 shadow-sm">
        <h3 className="pb-2 text-sm font-bold text-slate-900">
          기록한 날 <span className="font-semibold text-slate-500">{recordedDays}일</span>
        </h3>
        <div className="flex gap-px">
          {weeks.map((col, w) => (
            <div key={w} className="flex flex-1 flex-col gap-px">
              {col.map((day, r) =>
                day ? (
                  <div
                    key={r}
                    className="aspect-square w-full rounded-[1px] bg-blue-600"
                    style={{ opacity: day.ms === 0 ? 0.08 : 0.2 + 0.8 * (day.ms / maxDay) }}
                  />
                ) : (
                  <div key={r} className="aspect-square w-full" />
                ),
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between pt-1 text-[10px] text-slate-400">
          {MONTH_AXIS.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      </section>

      <section className="rounded-lg bg-white p-3 shadow-sm">
        <h3 className="pb-2 text-sm font-bold text-slate-900">{year}년 하이라이트</h3>
        <div className="grid grid-cols-2 gap-2">
          <Highlight
            k="가장 오래 머문 곳"
            v={stats.topPlace ? `${stats.topPlace.key} · ${fmtHours(stats.topPlace.durationMs)}` : '없음'}
          />
          <Highlight k="새로 방문한 장소" v={`${newPlaceCount}곳`} />
          <Highlight
            k="총 이동(직선)"
            v={stats.move.count > 0 ? `${Math.round(stats.move.distanceM / 1000).toLocaleString()}km` : '없음'}
          />
          <Highlight
            k="가장 바빴던 달"
            v={stats.busiestMonth ? `${stats.busiestMonth.month}월 · ${stats.busiestMonth.moveCount}회 이동` : '없음'}
          />
        </div>
      </section>
    </>
  );
}
