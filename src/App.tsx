import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthorizationStatus } from '@transistorsoft/background-geolocation-types';
import { useCollector } from './features/collector/useCollector';
import { PermissionSheet } from './features/collector/PermissionSheet';
import { CollectorSheet } from './features/collector/CollectorSheet';
import { useDayTimeline } from './features/stays/useDayTimeline';
import { MapView } from './features/map/MapView';
import { dropStaleEchoes } from './features/map/dropStaleEchoes';
import { collapseStayWindows } from './features/map/collapseStayWindows';
import { LabelSheet } from './features/stays/LabelSheet';
import { StatsPanel } from './features/stats/StatsPanel';
import { CalendarSheet } from './features/calendar/CalendarSheet';
import { useSwipe } from './lib/useSwipe';
import { importTimeline } from './features/import/importTimeline';
import { ImportGuideSheet } from './features/import/ImportGuideSheet';
import { AboutSheet } from './features/about/AboutSheet';
import type { ImportProgress } from './features/import/importTimeline';
import { appLog } from './lib/appLog';
import { deleteStay, findNearestLabel, getDatesWithData, getLabelCoords } from './db/stays';
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

// 지도 궤적 전용 필터 — 실내 저품질 픽스(수십~수백 m 튐)가 선을 삐죽하게 만든다.
// 체류 판정·통계는 원본 그대로 쓰고 표시만 거른다. null = 정보 없음(import 유래)이라 유지
const TRACK_MAX_ACCURACY_M = 35;

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
  const { isCollecting, error, permStatus, start, stop } = useCollector(invalidate);

  const { data } = useDayTimeline(date);
  const stays = useMemo(() => data?.stays ?? [], [data]);
  // 진행 중 클러스터는 아직 저장 전이라 별도 표시 — 오늘 화면에서만 의미가 있다
  const ongoing = date === today ? (data?.ongoing ?? null) : null;

  // 진행 중 위치가 저장된 장소 반경 안이면 '집(현재 위치)'처럼 이름으로 표기 — F5와 같은 findNearestLabel 재사용
  const { data: ongoingLabel = null } = useQuery({
    queryKey: ['timeline', 'ongoingLabel', ongoing?.lat, ongoing?.lng],
    queryFn: () => findNearestLabel(ongoing!.lat, ongoing!.lng),
    enabled: ongoing !== null,
  });

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

  // 지도 궤적: 정확도 필터 → 메아리 드롭 → 체류 창 접기(창 안 점 대신 마커 좌표 한 점).
  // useMemo 참조 안정화 — 무관한 리렌더마다 새 배열이면 MapView가 fitBounds를 다시 해버린다
  const points = useMemo(() => {
    const usable = dropStaleEchoes(
      (data?.points ?? []).filter((p) => p.accuracy_m == null || p.accuracy_m <= TRACK_MAX_ACCURACY_M),
    );
    const windows = [
      ...stays.map((s) => ({ startTs: s.start_ts, endTs: s.end_ts, ...snapCoord(s) })),
      ...(ongoing
        ? [{ startTs: ongoing.startTs, endTs: ongoing.endTs, lat: ongoing.lat, lng: ongoing.lng }]
        : []),
    ];
    return collapseStayWindows(usable, windows);
  }, [data, stays, ongoing, snapCoord]);

  // 달력 점 표시 — 기록 있는 날 집합
  const { data: dataDays = [] } = useQuery({
    queryKey: ['timeline', 'dataDays'],
    queryFn: getDatesWithData,
  });
  const dataDaySet = useMemo(() => new Set(dataDays), [dataDays]);

  const [showCalendar, setShowCalendar] = useState(false);
  const [showImportGuide, setShowImportGuide] = useState(false);
  const [showPermRationale, setShowPermRationale] = useState(false);
  const [showCollector, setShowCollector] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [labelTarget, setLabelTarget] = useState<Stay | null>(null);
  const [selected, setSelected] = useState<Stay | null>(null);
  const [ongoingSelected, setOngoingSelected] = useState(false);
  // 날짜 변경 방향 — 새 날짜 콘텐츠가 이동 방향에서 밀려 들어오는 애니메이션에 쓴다 (초기 로드엔 없음)
  const [slideDir, setSlideDir] = useState<'next' | 'prev' | null>(null);
  const cardRefs = useRef(new Map<number, HTMLLIElement>());

  // Android 하드웨어 뒤로가기: 열린 오버레이를 위에서부터 닫고, 없으면 종료 대신 백그라운드로
  const closeTopOverlay = () => {
    if (labelTarget) {
      setLabelTarget(null);
      return true;
    }
    if (showCalendar) {
      setShowCalendar(false);
      return true;
    }
    if (showImportGuide) {
      setShowImportGuide(false);
      return true;
    }
    if (showPermRationale) {
      setShowPermRationale(false);
      return true;
    }
    if (showCollector) {
      setShowCollector(false);
      return true;
    }
    if (showStats) {
      setShowStats(false);
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
    setSlideDir(d > date ? 'next' : 'prev');
    setSelected(null);
    setOngoingSelected(false);
    setDate(d);
  };

  const selectStay = (s: Stay | null) => {
    setOngoingSelected(false);
    setSelected(s);
  };

  // 수집 시작(시트에서 호출): 이미 '항상 허용'이면 바로 시작, 아니면 사전 설명 모달(U9)부터
  const handleStartRequest = () => {
    setShowCollector(false);
    if (permStatus === AuthorizationStatus.Always) void start();
    else setShowPermRationale(true);
  };

  // 왼쪽 스와이프 = 다음날(미래는 ▶ 버튼과 동일하게 차단), 오른쪽 스와이프 = 전날
  const swipeDate = useSwipe(
    () => {
      if (date < today) changeDate(addDays(date, 1));
    },
    () => changeDate(addDays(date, -1)),
  );

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
      appLog('error', 'import', String(err));
      window.alert('가져오기 실패 — 파일 형식을 확인해주세요');
    } finally {
      setImporting(null);
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
        <h1>
          <button
            type="button"
            onClick={() => changeDate(today)}
            className="text-xl font-bold text-slate-900"
          >
            위치트래커
          </button>
        </h1>
        <div className="flex items-center gap-2">
          {/* 상태 표시만 — 시작/중지 행동은 시트 안(CollectorSheet)으로. 꺼짐은 amber로 시선 유도 */}
          <button
            type="button"
            onClick={() => setShowCollector(true)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              isCollecting
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-300 bg-amber-50 text-amber-700'
            }`}
          >
            {isCollecting ? '● 수집 중' : '○ 수집 꺼짐'}
          </button>
          <button
            type="button"
            aria-label="통계"
            onClick={() => setShowStats(true)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600"
          >
            <svg viewBox="0 0 16 16" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <rect x="1.5" y="8" width="3" height="6.5" rx="0.75" />
              <rect x="6.5" y="4" width="3" height="10.5" rx="0.75" />
              <rect x="11.5" y="1.5" width="3" height="13" rx="0.75" />
            </svg>
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
                      setShowImportGuide(true);
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
                      setShowAbout(true);
                    }}
                    className="block w-full px-4 py-2 text-left text-sm text-slate-700"
                  >
                    앱 정보
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {error && <p className="rounded-lg bg-red-100 p-3 text-sm text-red-700">{error}</p>}

      {/* 권한 미흡 안내 — 수집 안 켜진 상태에서 '앱 사용 중만'/'거부'면 승격을 유도 */}
      {!isCollecting &&
        (permStatus === AuthorizationStatus.WhenInUse ||
          permStatus === AuthorizationStatus.Denied ||
          permStatus === AuthorizationStatus.Restricted) && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <p>
              {permStatus === AuthorizationStatus.WhenInUse
                ? '‘앱 사용 중에만 허용’ 상태예요. 앱이 꺼지면 기록이 끊깁니다.'
                : '위치 권한이 꺼져 있어 기록할 수 없어요.'}
            </p>
            <button
              type="button"
              onClick={() => void start()}
              className="mt-2 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white"
            >
              권한 다시 요청
            </button>
            <p className="mt-1.5 text-xs text-amber-600">
              창이 안 뜨면 설정 &gt; 앱 &gt; 위치트래커 &gt; 권한 &gt; 위치에서 ‘항상 허용’으로 바꿔주세요.
            </p>
          </div>
        )}

      {importing && (
        <p className="rounded-lg bg-blue-100 p-3 text-sm text-blue-700">
          가져오는 중…{' '}
          {importing.total > 0 && `${Math.round((importing.done / importing.total) * 100)}%`}
        </p>
      )}

      <div
        {...swipeDate}
        className="flex items-center justify-between rounded-lg bg-white p-2 shadow-sm"
      >
        <button type="button" onClick={() => changeDate(addDays(date, -1))} className="px-4 py-1 text-lg text-slate-600">
          ◀
        </button>
        <button type="button" onClick={() => setShowCalendar(true)} className="text-sm font-semibold text-slate-900">
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

      {/* grow로 남는 세로 공간까지 채워 카드 아래 빈 영역도 스와이프 대상이 되게 한다 */}
      <div {...swipeDate} className="grow overflow-hidden">
        {/* key={date}로 remount → 날짜가 바뀔 때마다 이동 방향의 slide-in이 한 번 재생된다 */}
        <ul
          key={date}
          className={`flex flex-col gap-2 ${
            slideDir === 'next'
              ? 'animate-slide-in-right'
              : slideDir === 'prev'
                ? 'animate-slide-in-left'
                : ''
          }`}
        >
          {stays.map((s) => (
          <li
            key={s.id}
            ref={(el) => {
              if (el) cardRefs.current.set(s.id, el);
              else cardRefs.current.delete(s.id);
            }}
            onClick={() => selectStay(selected?.id === s.id ? null : s)}
            className={`rounded-lg bg-white p-3 shadow-sm active:bg-slate-100 ${
              selected?.id === s.id ? 'ring-2 ring-inset ring-blue-500' : ''
            }`}
          >
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-slate-900">{s.label ?? '이름 없는 장소'}</span>
              <span className="text-sm text-slate-500">{fmtDuration(s.start_ts, s.end_ts)}</span>
            </div>
            <div className="text-sm text-slate-500">
              {fmtTime(s.start_ts)} ~ {fmtTime(s.end_ts)}
            </div>
            {/* 좌표는 매일 보는 정보가 아니라서 펼쳤을 때만 (U19) */}
            {selected?.id === s.id && (
              <>
                <div className="pt-1 text-xs text-slate-400">
                  {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
                </div>
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
              </>
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
              ongoingSelected ? 'ring-2 ring-inset ring-blue-500' : ''
            }`}
          >
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-blue-700">
                {ongoingLabel ? `${ongoingLabel}(현재 위치)` : '지금 여기'}
              </span>
              <span className="text-sm text-slate-500">{fmtDuration(ongoing.startTs, ongoing.endTs)}째</span>
            </div>
            <div className="text-sm text-slate-500">{fmtTime(ongoing.startTs)} ~ 진행 중</div>
            {ongoingSelected && (
              <div className="pt-1 text-xs text-slate-400">
                {ongoing.lat.toFixed(5)}, {ongoing.lng.toFixed(5)}
              </div>
            )}
          </li>
        )}

          {stays.length === 0 && !ongoing && (
            <li className="p-6 text-center text-sm text-slate-400">이 날짜의 체류 기록이 없습니다</li>
          )}
        </ul>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={onImportFile}
      />

      {showCalendar && (
        <CalendarSheet
          value={date}
          today={today}
          dataDays={dataDaySet}
          onPick={(d) => {
            changeDate(d);
            setShowCalendar(false);
          }}
          onClose={() => setShowCalendar(false)}
        />
      )}
      {showImportGuide && (
        <ImportGuideSheet
          onPickFile={() => {
            setShowImportGuide(false);
            fileRef.current?.click();
          }}
          onClose={() => setShowImportGuide(false)}
        />
      )}
      {showPermRationale && (
        <PermissionSheet
          onConfirm={() => {
            setShowPermRationale(false);
            void start();
          }}
          onClose={() => setShowPermRationale(false)}
        />
      )}
      {showCollector && (
        <CollectorSheet
          isCollecting={isCollecting}
          permStatus={permStatus}
          totalPoints={total}
          onStart={handleStartRequest}
          onStop={() => {
            void stop();
            setShowCollector(false);
          }}
          onClose={() => setShowCollector(false)}
        />
      )}
      {showAbout && <AboutSheet onClose={() => setShowAbout(false)} />}
      {showStats && <StatsPanel onClose={() => setShowStats(false)} />}
      {labelTarget && <LabelSheet stay={labelTarget} onClose={() => setLabelTarget(null)} />}
    </div>
  );
}

export default App;
