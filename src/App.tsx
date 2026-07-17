import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCollector } from './features/collector/useCollector';
import { useDayTimeline } from './features/stays/useDayTimeline';
import { MapView } from './features/map/MapView';
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
  const stays = data?.stays ?? [];
  const points = data?.points ?? [];
  // 진행 중 클러스터는 아직 저장 전이라 별도 표시 — 오늘 화면에서만 의미가 있다
  const ongoing = date === today ? (data?.ongoing ?? null) : null;

  const { data: total = 0 } = useQuery({
    queryKey: ['timeline', 'count'],
    queryFn: countPoints,
    refetchInterval: 30_000,
  });

  const stayMarkers = [
    ...stays.map((s) => ({ lat: s.lat, lng: s.lng })),
    ...(ongoing ? [{ lat: ongoing.lat, lng: ongoing.lng }] : []),
  ];

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
        <button type="button" onClick={() => setDate(addDays(date, -1))} className="px-4 py-1 text-lg text-slate-600">
          ◀
        </button>
        <button type="button" onClick={() => setDate(today)} className="text-sm font-semibold text-slate-900">
          {date}
          {date === today && <span className="ml-1 text-blue-600">(오늘)</span>}
        </button>
        <button
          type="button"
          onClick={() => setDate(addDays(date, 1))}
          disabled={date >= today}
          className="px-4 py-1 text-lg text-slate-600 disabled:text-slate-300"
        >
          ▶
        </button>
      </div>

      <MapView trackPoints={points} stays={stayMarkers} />

      <ul className="flex flex-col gap-2">
        {stays.map((s) => (
          <li key={s.id} className="rounded-lg bg-white p-3 shadow-sm">
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
          </li>
        ))}

        {ongoing && (
          <li className="rounded-lg border-2 border-blue-200 bg-white p-3 shadow-sm">
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
        <span>{isCollecting ? '수집 중 (1분 간격)' : '수집 꺼짐'}</span>
      </footer>
    </div>
  );
}

export default App;
