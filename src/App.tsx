import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCollector } from './features/collector/useCollector';
import { countPoints, getRecentPoints } from './db/points';

function App() {
  const queryClient = useQueryClient();
  const invalidatePoints = () => queryClient.invalidateQueries({ queryKey: ['points'] });
  const { isCollecting, error, start, stop } = useCollector(invalidatePoints);

  const { data: points = [] } = useQuery({
    queryKey: ['points', 'recent'],
    queryFn: () => getRecentPoints(50),
    refetchInterval: 30_000,
  });
  const { data: total = 0 } = useQuery({
    queryKey: ['points', 'count'],
    queryFn: countPoints,
    refetchInterval: 30_000,
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-slate-50 p-4">
      <header className="pt-6">
        <h1 className="text-xl font-bold text-slate-900">위치 트래커 — 수집기 PoC</h1>
        <p className="text-sm text-slate-500">1분 간격 백그라운드 수집 검증</p>
      </header>

      <button
        type="button"
        onClick={isCollecting ? stop : start}
        className={`rounded-xl py-4 text-lg font-semibold text-white ${
          isCollecting ? 'bg-red-500' : 'bg-blue-600'
        }`}
      >
        {isCollecting ? '수집 중지' : '수집 시작'}
      </button>

      {error && (
        <p className="rounded-lg bg-red-100 p-3 text-sm text-red-700">{error}</p>
      )}

      <div className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
        <span className="text-sm text-slate-500">누적 points</span>
        <span className="text-lg font-bold text-slate-900">{total.toLocaleString()}</span>
      </div>

      <ul className="flex flex-col gap-1 overflow-y-auto">
        {points.map((p) => (
          <li key={p.id} className="rounded-lg bg-white p-3 text-xs shadow-sm">
            <div className="font-mono text-slate-900">{p.ts}</div>
            <div className="text-slate-500">
              {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
              {p.accuracy_m != null && ` (±${Math.round(p.accuracy_m)}m)`}
            </div>
          </li>
        ))}
        {points.length === 0 && (
          <li className="p-6 text-center text-sm text-slate-400">
            아직 수집된 point가 없습니다
          </li>
        )}
      </ul>
    </div>
  );
}

export default App;
