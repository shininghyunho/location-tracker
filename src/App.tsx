import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCollector } from './features/collector/useCollector';
import { useDayTimeline } from './features/stays/useDayTimeline';
import { MapView } from './features/map/MapView';
import { exportData } from './features/export/exportData';
import { LogPanel } from './features/logs/LogPanel';
import { LabelSheet } from './features/stays/LabelSheet';
import { StatsPanel } from './features/stats/StatsPanel';
import { importTimeline } from './features/import/importTimeline';
import type { ImportProgress } from './features/import/importTimeline';
import { appLog } from './db/logs';
import { deleteStay, getLabelCoords } from './db/stays';
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

  // 같은 라벨은 항상 대표 좌표 한 점에 표시 — stay별 중심점 산포로 한 장소가 지도에 여러 곳으로 찍히는 것 방지
  const { data: labelCoords = {} } = useQuery({
    queryKey: ['timeline', 'labelCoords'],
    queryFn: getLabelCoords,
  });
  const snapCoord = useCallback(
    (s: Stay): { lat: number; lng: number } =>
      (s.label ? labelCoords[s.label] : undefined) ?? { lat: s.lat, lng: s.lng },
    [labelCoords],
  );

  const [showLogs, setShowLogs] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [labelTarget, setLabelTarget] = useState<Stay | null>(null);
  const [selected, setSelected] = useState<Stay | null>(null);
  const [ongoingSelected, setOngoingSelected] = useState(false);
  const cardRefs = useRef(new Map<number, HTMLLIElement>());

  // Android 하드웨어 뒤로가기: 열린 오버레이를 위에서부터 닫고, 없으면 종료 대신 백그라운드로
  const closeTopOverlay = () => {
    if (labelTarget) {
      setLabelTarget(null);
      return true;
    }
    if (showStats) {
      setShowStats(false);
      return true;
    }
    if (showLogs) {
      setShowLogs(false);
      return true;
    }
    if (menuOpen) {
      setMenuOpen(false);
      return true;
    }
    return false;
  };
  const closeTopRef = useRef(closeTopOverlay);
  closeTopRef.current = closeTopOverlay;
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const sub = CapApp.addListener('backButton', () => {
      if (!closeTopRef.current()) CapApp.minimizeApp();
    });
    return () => {
      sub.then((s) => s.remove());
    };
  }, []);

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
  const [importing, setImporting] = useState<ImportProgress | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일을 다시 선택해도 change 이벤트가 뜨도록 초기화
    if (!file) return;
    setImporting({ done: 0, total: 0 });
    try {
      const r = await importTimeline(file, setImporting);
      invalidate();
      window.alert(
        `가져오기 완료: 위치 ${r.pointCount.toLocaleString()}건 · 체류 ${r.stayCount.toLocaleString()}건 추가`,
      );
    } catch (err) {
      await appLog('error', 'import', String(err));
      window.alert('가져오기 실패 — 파일 형식을 확인해주세요');
    } finally {
      setImporting(null);
    }
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
      ...stays.map((s) => ({ id: s.id, ...snapCoord(s) })),
      ...(ongoing ? [{ id: null, lat: ongoing.lat, lng: ongoing.lng }] : []),
    ],
    [stays, ongoing, snapCoord],
  );
  const focus = useMemo(() => {
    if (selected) return snapCoord(selected);
    if (ongoingSelected && ongoing) return { lat: ongoing.lat, lng: ongoing.lng };
    return null;
  }, [selected, ongoingSelected, ongoing, snapCoord]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-3 bg-slate-50 p-4">
      <header className="flex items-center justify-between pt-6">
        <h1 className="text-xl font-bold text-slate-900">위치 트래커</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={isCollecting ? stop : start}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
              isCollecting ? 'bg-red-500' : 'bg-blue-600'
            }`}
          >
            {isCollecting ? '수집 중지' : '수집 시작'}
          </button>
          <div className="relative">
            <button
              type="button"
              aria-label="메뉴"
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600"
            >
              ⚙
            </button>
            {menuOpen && (
              <>
                {/* 지도(leaflet z-index ~1000)보다 위 — 바깥 탭으로 닫기 */}
                <div className="fixed inset-0 z-[1040]" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-[1050] mt-1 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      fileRef.current?.click();
                    }}
                    disabled={importing !== null}
                    className="block w-full px-4 py-2 text-left text-sm text-slate-700 disabled:text-slate-300"
                  >
                    {importing ? '가져오는 중…' : '가져오기'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onExport();
                    }}
                    disabled={exporting}
                    className="block w-full px-4 py-2 text-left text-sm text-slate-700 disabled:text-slate-300"
                  >
                    {exporting ? '내보내는 중…' : '내보내기'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setShowLogs(true);
                    }}
                    className="block w-full px-4 py-2 text-left text-sm text-slate-700"
                  >
                    로그
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setShowStats(true);
                    }}
                    className="block w-full px-4 py-2 text-left text-sm text-slate-700"
                  >
                    통계
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {error && <p className="rounded-lg bg-red-100 p-3 text-sm text-red-700">{error}</p>}

      {importing && (
        <p className="rounded-lg bg-blue-100 p-3 text-sm text-blue-700">
          가져오는 중…{' '}
          {importing.total > 0 && `${Math.round((importing.done / importing.total) * 100)}%`}
        </p>
      )}

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
        <span>{isCollecting ? '수집 중 (1분 간격)' : '수집 꺼짐'}</span>
      </footer>

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={onImportFile}
      />

      {showLogs && <LogPanel onClose={() => setShowLogs(false)} />}
      {showStats && <StatsPanel onClose={() => setShowStats(false)} />}
      {labelTarget && <LabelSheet stay={labelTarget} onClose={() => setLabelTarget(null)} />}
    </div>
  );
}

export default App;
