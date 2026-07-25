import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAllLabels, getStaysByLabel } from '../../db/stays';
import { fmtDateWithDay, fmtDuration, todayStr } from '../../lib/date';
import { computePlaceSummary } from './placeSummary';

const HOUR_MS = 3_600_000;

// 연간 하이라이트와 같은 표기 — 총량은 분까지 쓰면 길어 시간으로 반올림
function fmtTotal(ms: number): string {
  return ms < HOUR_MS ? fmtDuration(ms) : `${Math.round(ms / HOUR_MS).toLocaleString()}시간`;
}

function fmtDaysAgo(days: number): string {
  if (days === 0) return '오늘';
  if (days === 1) return '어제';
  return `${days}일 전`;
}

interface SearchPanelProps {
  onClose: () => void;
  onPickDate: (date: string) => void;
  // 발자국 지도의 원 탭 → 그 장소 상세로 바로 진입 (열 때마다 remount라 초기값으로 충분)
  initialQuery?: string;
}

export function SearchPanel({ onClose, onPickDate, initialQuery }: SearchPanelProps) {
  const [query, setQuery] = useState(initialQuery ?? '');
  const { data: labels = [] } = useQuery({ queryKey: ['search', 'labels'], queryFn: getAllLabels });
  const q = query.trim();
  // 별도 선택 state 없이 입력값이 라벨과 정확히 일치하면 선택으로 본다 — 목록 탭이 입력을 채우는 방식
  const selected = labels.includes(q) ? q : null;
  const matches = q === '' ? labels : labels.filter((l) => l.includes(q));

  const { data: visits = [] } = useQuery({
    queryKey: ['search', 'visits', selected],
    queryFn: () => getStaysByLabel(selected!),
    enabled: selected !== null,
  });
  const summary = useMemo(() => computePlaceSummary(visits, todayStr()), [visits]);

  return (
    <div className="fixed inset-0 z-[1100] flex flex-col bg-slate-50 p-4 dark:bg-slate-950">
      <header className="flex items-center gap-2 pb-3 pt-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="뒤로"
          className="rounded-md px-2 py-1 text-xl text-slate-600 dark:text-slate-300"
        >
          ←
        </button>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">장소 검색</h2>
      </header>

      <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 shadow-sm dark:bg-slate-900">
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="4.5" />
          <line x1="10.5" y1="10.5" x2="14" y2="14" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="장소 이름으로 검색"
          className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </div>

      <div className="mt-3 flex flex-col gap-3 overflow-y-auto pb-4">
        {selected === null ? (
          <section className="rounded-lg bg-white py-1 shadow-sm dark:bg-slate-900">
            {matches.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setQuery(l)}
                className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-slate-900 dark:text-slate-100"
              >
                {l}
              </button>
            ))}
            {matches.length === 0 && (
              <p className="p-4 text-center text-sm text-slate-400 dark:text-slate-500">
                일치하는 장소가 없습니다
              </p>
            )}
          </section>
        ) : (
          <>
            <section className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {selected}
                </span>
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                  라벨
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                방문 {summary.visitCount.toLocaleString()}회 · 총 {fmtTotal(summary.totalMs)}
                {summary.lastVisitDaysAgo !== null &&
                  ` · 마지막 방문 ${fmtDaysAgo(summary.lastVisitDaysAgo)}`}
              </p>
            </section>

            <section className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">최근 방문</h3>
              <p className="pb-1 pt-0.5 text-xs text-slate-400 dark:text-slate-500">
                날짜를 누르면 그 날 타임라인으로 이동해요
              </p>
              <ul>
                {visits.map((v) => (
                  <li key={v.id} className="border-t border-slate-100 first:border-t-0 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => onPickDate(v.start_ts.slice(0, 10))}
                      className="flex w-full items-baseline justify-between py-2 text-left"
                    >
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {fmtDateWithDay(v.start_ts.slice(0, 10))}
                      </span>
                      <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        {v.start_ts.slice(11, 16)} – {v.end_ts.slice(11, 16)} ·{' '}
                        {fmtDuration(Date.parse(v.end_ts) - Date.parse(v.start_ts))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
