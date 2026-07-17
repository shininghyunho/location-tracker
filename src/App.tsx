import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCollector } from './features/collector/useCollector';
import { useDayTimeline } from './features/stays/useDayTimeline';
import { MapView } from './features/map/MapView';
import { exportData } from './features/export/exportData';
import { LogPanel } from './features/logs/LogPanel';
import { LabelSheet } from './features/stays/LabelSheet';
import { deleteStay } from './db/stays';
import type { Stay } from './db/stays';
import { countPoints } from './db/points';

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return localDateStr(d);
}

function fmtTime(ts: string): string {
  return ts.slice(11, 16);
}

function fmtDuration(startTs: string, endTs: string): string {
  const min = Math.round((Date.parse(endTs) - Date.parse(startTs)) / 60_000);
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}시간 ${min % 60}분` : `${min}분`;
}

function App() {
  const queryClient = useQueryClient();
  const today = localDateStr(new Date());
  const [date, setDate] = useState(today);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['timeline'] });
  const { isCollecting, error, start, stop } = useCollector(invalidate);

  const { data } = useDayTimeline(date);
  const stays = useMemo(() => data?.stays ?? [], [data]);
  const points = data?.points ?? [];
  // 진행 중 클러스터는 아직 저장 전이라 별도 표시 — 오늘 화면에서만 의미가 있다
  const ongoing = date === today ? (data?.ongoing ?? null) : null;

  const { data: total = 0 } = useQuery({
    queryKey: ['timeline', 'count'],
    queryFn: countPoints,
    refetchInterval: 30_000,
  });

  const [showLogs, setShowLogs] = useState(false);
  const [labelTarget, setLabelTarget] = useState<Stay | null>(null);
  const [selected, setSelected] = useState<Stay | null>(null);
  const [ongoingSelected, setOngoingSelected] = useState(false);
  const cardRefs = useRef(new Map<number, HTMLLIElement>());

  // 날짜를 옮기면 이전 날짜의 선택이 남지 않게 함께 해제한다
  const changeDate = (d: string) => {
    setSelected(null);
    setOngoingSelected(false);
    setDate(d);
  };

  const selectStay = (s: Stay | null) => {
    setOngoingSelected(false);
    setSelected(s);
  };

  const onStayTap = (id: number) => {
    const stay = stays.find((s) => s.id === id);
    if (!stay) return;
    selectStay(stay);
    cardRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const onDelete = async (s: Stay) => {
    if (!window.confirm('이 체류 기록을 삭제할까요?')) return;
    await deleteStay(s.id);
    setSelected(null);
    invalidate();
  };
  const [exporting, setExporting] = useState(false);
  const onExport = async () => {
    setExporting(true);
    try {
      await exportData();
    } catch {
      // 공유 시트를 취소해도 reject되므로 조용히 무시한다
    } finally {
      setExporting(false);
    }
  };

  // 선택으로 리렌더될 때 참조가 바뀌면 MapView가 전체 범위로 다시 fitBounds 해버린다 — memoize 필수
  const stayMarkers = useMemo(
    () => [
      ...stays.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng })),
      ...(ongoing ? [{ id: null, lat: ongoing.lat, lng: ongoing.lng }] : []),
    ],
    [stays, ongoing],
  );
  const focus = useMemo(() => {
    if (selected) return { lat: selected.lat, lng: selected.lng };
    if (ongoingSelected && ongoing) return { lat: ongoing.lat, lng: ongoing.lng };
    return null;
  }, [selected, ongoingSelected, ongoing]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-3 bg-slate-50 p-4">
      <header className="flex items-center justify-between pt-6">
        <h1 className="text-xl font-bold text-slate-900">위치 트래커</h1>
        <button
          type="button"
          onClick={isCollecting ? stop : start}
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
            isCollecting ? 'bg-red-500' : 'bg-blue-600'
          }`}
        >
          {isCollecting ? '수집 중지' : '수집 시작'}
        </button>
      </header>

      {error && <p className="rounded-lg bg-red-100 p-3 text-sm text-red-700">{error}</p>}

      <div className="flex items-center justify-between rounded-lg bg-white p-2 shadow-sm">
        <button type="button" onClick={() => changeDate(addDays(date, -1))} className="px-4 py-1 text-lg text-slate-600">
          ◀
        </button>
        <button type="button" onClick={() => changeDate(today)} className="text-sm font-semibold text-slate-900">
          {date}
          {date === today && <span className="ml-1 text-blue-600">(오늘)</span>}
        </button>
        <button
          type="button"
          onClick={() => changeDate(addDays(date, 1))}
          disabled={date >= today}
          className="px-4 py-1 text-lg text-slate-600 disabled:text-slate-300"
        >
          ▶
        </button>
      </div>

      <MapView trackPoints={points} stays={stayMarkers} focus={focus} onStayTap={onStayTap} />

      <ul className="flex flex-col gap-2">
        {stays.map((s) => (
          <li
            key={s.id}
            ref={(el) => {
              if (el) cardRefs.current.set(s.id, el);
              else cardRefs.current.delete(s.id);
            }}
            onClick={() => selectStay(selected?.id === s.id ? null : s)}
            className={`rounded-lg bg-white p-3 shadow-sm active:bg-slate-100 ${
              selected?.id === s.id ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-slate-900">{s.label ?? '이름 없는 장소'}</span>
              <span className="text-sm text-slate-500">{fmtDuration(s.start_ts, s.end_ts)}</span>
            </div>
            <div className="text-sm text-slate-500">
              {fmtTime(s.start_ts)} ~ {fmtTime(s.end_ts)}
            </div>
            <div className="text-xs text-slate-400">
              {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
            </div>
            {selected?.id === s.id && (
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLabelTarget(s);
                  }}
                  className="flex-1 rounded-md bg-blue-50 py-2 text-sm font-semibold text-blue-700"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(s);
                  }}
                  className="flex-1 rounded-md bg-red-50 py-2 text-sm font-semibold text-red-600"
                >
                  삭제
                </button>
              </div>
            )}
          </li>
        ))}

        {ongoing && (
          <li
            onClick={() => {
              setSelected(null);
              setOngoingSelected(!ongoingSelected);
            }}
            className={`rounded-lg border-2 border-blue-200 bg-white p-3 shadow-sm active:bg-slate-100 ${
              ongoingSelected ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-blue-700">지금 여기</span>
              <span className="text-sm text-slate-500">{fmtDuration(ongoing.startTs, ongoing.endTs)}째</span>
            </div>
            <div className="text-sm text-slate-500">{fmtTime(ongoing.startTs)} ~ 진행 중</div>
            <div className="text-xs text-slate-400">
              {ongoing.lat.toFixed(5)}, {ongoing.lng.toFixed(5)}
            </div>
          </li>
        )}

        {stays.length === 0 && !ongoing && (
          <li className="p-6 text-center text-sm text-slate-400">이 날짜의 체류 기록이 없습니다</li>
        )}
      </ul>

      <footer className="mt-auto flex items-center justify-between pb-2 text-xs text-slate-400">
        <span>누적 points {total.toLocaleString()}</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowLogs(true)}
            className="rounded-md border border-slate-300 px-3 py-1 font-semibold text-slate-600"
          >
            로그
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="rounded-md border border-slate-300 px-3 py-1 font-semibold text-slate-600 disabled:text-slate-300"
          >
            {exporting ? '백업 중…' : '백업'}
          </button>
        </div>
        <span>{isCollecting ? '수집 중 (1분 간격)' : '수집 꺼짐'}</span>
      </footer>

      {showLogs && <LogPanel onClose={() => setShowLogs(false)} />}
      {labelTarget && <LabelSheet stay={labelTarget} onClose={() => setLabelTarget(null)} />}
    </div>
  );
}

export default App;
