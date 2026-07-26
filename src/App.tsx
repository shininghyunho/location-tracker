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
import type { MapMode } from './features/map/MapView';
import { dropStaleEchoes } from './features/map/dropStaleEchoes';
import { collapseStayWindows } from './features/map/collapseStayWindows';
import { computeFootprints } from './features/map/computeFootprints';
import { LabelSheet } from './features/stays/LabelSheet';
import { StayList } from './features/stays/StayList';
import { StatsPanel } from './features/stats/StatsPanel';
import { SearchPanel } from './features/search/SearchPanel';
import { CalendarSheet } from './features/calendar/CalendarSheet';
import { useSwipe } from './lib/useSwipe';
import { importTimeline } from './features/import/importTimeline';
import { ImportGuideSheet } from './features/import/ImportGuideSheet';
import { AboutSheet } from './features/about/AboutSheet';
import { ThemeSheet } from './features/theme/ThemeSheet';
import { BackupSheet } from './features/backup/BackupSheet';
import type { ImportProgress } from './features/import/importTimeline';
import { appLog } from './lib/appLog';
import { addDaysStr, fmtDateWithDay, todayStr } from './lib/date';
import { deleteStay, findNearestLabel, getDatesWithData, getLabelCoords, getLabeledStays, insertStay } from './db/stays';
import type { Stay } from './db/stays';
import { countPoints } from './db/points';

// 지도 궤적 전용 필터 — 실내 저품질 픽스(수십~수백 m 튐)가 선을 삐죽하게 만든다.
// 체류 판정·통계는 원본 그대로 쓰고 표시만 거른다. null = 정보 없음(import 유래)이라 유지
const TRACK_MAX_ACCURACY_M = 35;

function App() {
  const queryClient = useQueryClient();
  const today = todayStr();
  const [date, setDate] = useState(today);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['timeline'] });
  const { isCollecting, error, permStatus, start, stop } = useCollector(invalidate);

  const { data } = useDayTimeline(date);
  const stays = useMemo(() => data?.stays ?? [], [data]);
  // 진행 중 클러스터는 아직 저장 전이라 별도 표시 — 걸친 날짜(시작일~오늘) 모두에 띄운다.
  // 오늘로만 한정하면 자정 넘긴 체류(집 귀가 등)가 시작일 화면에서 사라진다
  const ongoing =
    data?.ongoing != null && data.ongoing.startTs.slice(0, 10) <= date && date <= today
      ? data.ongoing
      : null;
  // 블랙아웃을 이어붙여 저장 체류로 흡수된 '진행 중' 체류 — 그 카드를 진행 중으로 그린다.
  // 저장 체류는 걸친 날짜에만 조회되므로(getStaysByDate overlap) 날짜 게이트가 따로 필요 없다
  const liveStayId = data?.liveStayId ?? null;

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

  // 오버레이는 설계상 한 번에 하나만 — union 하나로 동시 열림을 타입 수준에서 차단.
  // labelTarget은 열림 여부가 아니라 대상 Stay를 담으므로 별도 유지
  const [overlay, setOverlay] = useState<
    | 'calendar'
    | 'importGuide'
    | 'backup'
    | 'permRationale'
    | 'collector'
    | 'about'
    | 'theme'
    | 'stats'
    | 'search'
    | 'menu'
    | null
  >(null);
  const [labelTarget, setLabelTarget] = useState<Stay | null>(null);
  const [selected, setSelected] = useState<Stay | null>(null);
  const [ongoingSelected, setOngoingSelected] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>('day');
  // 발자국 원 탭으로 검색을 열 때 그 장소 상세로 바로 진입시키는 초기 검색어
  const [searchLabel, setSearchLabel] = useState<string | null>(null);

  // 발자국 데이터는 모드를 켰을 때만 조회 — 'timeline' 프리픽스로 라벨 수정 시 함께 갱신된다
  const { data: footprints = [] } = useQuery({
    queryKey: ['timeline', 'footprints'],
    queryFn: async () => computeFootprints(await getLabeledStays()),
    enabled: mapMode === 'all',
  });
  // 날짜 변경 방향 — 새 날짜 콘텐츠가 이동 방향에서 밀려 들어오는 애니메이션에 쓴다 (초기 로드엔 없음)
  const [slideDir, setSlideDir] = useState<'next' | 'prev' | null>(null);
  const cardRefs = useRef(new Map<number, HTMLLIElement>());

  // Android 하드웨어 뒤로가기: 열린 오버레이를 위에서부터 닫고, 없으면 종료 대신 백그라운드로
  const closeTopOverlay = () => {
    if (labelTarget) {
      setLabelTarget(null);
      return true;
    }
    if (overlay) {
      setOverlay(null);
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
    // 발자국 모드에서 카드를 고르면 하루 모드로 복귀 — 포커스 이동이 하루 궤적 위에서만 의미 있다
    if (s) setMapMode('day');
  };

  // 수집 시작(시트에서 호출): 이미 '항상 허용'이면 바로 시작, 아니면 사전 설명 모달(U9)부터
  const handleStartRequest = () => {
    if (permStatus === AuthorizationStatus.Always) {
      setOverlay(null);
      void start();
    } else {
      setOverlay('permRationale');
    }
  };

  // 왼쪽 스와이프 = 다음날(미래는 ▶ 버튼과 동일하게 차단), 오른쪽 스와이프 = 전날
  const swipeDate = useSwipe(
    () => {
      if (date < today) changeDate(addDaysStr(date, 1));
    },
    () => changeDate(addDaysStr(date, -1)),
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

  // 진행 중(저장 전) 카드의 '수정': 이미 체류 자격(≥minDuration)을 갖춘 클러스터를
  // 지금 체류로 확정해 그 stay로 라벨 시트를 연다. 저장 뒤엔 다음 재계산이 liveStayId로
  // 인수해 계속 '진행 중'으로 연장되므로 중복 카드는 생기지 않는다.
  const onLabelOngoing = async () => {
    if (!ongoing) return;
    const label = await findNearestLabel(ongoing.lat, ongoing.lng);
    const id = await insertStay({
      start_ts: ongoing.startTs,
      end_ts: ongoing.endTs,
      lat: ongoing.lat,
      lng: ongoing.lng,
      label,
      source: 'collector',
    });
    setOngoingSelected(false);
    setLabelTarget({
      id,
      start_ts: ongoing.startTs,
      end_ts: ongoing.endTs,
      lat: ongoing.lat,
      lng: ongoing.lng,
      label,
      source: 'collector',
      deleted: 0,
    });
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
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-3 bg-slate-50 p-4 dark:bg-slate-950">
      <header className="flex items-center justify-between pt-6">
        <h1>
          <button
            type="button"
            onClick={() => changeDate(today)}
            className="text-xl font-bold text-slate-900 dark:text-slate-100"
          >
            위치트래커
          </button>
        </h1>
        <div className="flex items-center gap-2">
          {/* 상태 표시만 — 시작/중지 행동은 시트 안(CollectorSheet)으로. 꺼짐은 amber로 시선 유도 */}
          <button
            type="button"
            onClick={() => setOverlay('collector')}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              isCollecting
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300'
            }`}
          >
            {isCollecting ? '● 수집 중' : '○ 수집 꺼짐'}
          </button>
          <button
            type="button"
            aria-label="장소 검색"
            onClick={() => {
              setSearchLabel(null);
              setOverlay('search');
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-300"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <circle cx="7" cy="7" r="4.5" />
              <line x1="10.5" y1="10.5" x2="14" y2="14" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="통계"
            onClick={() => setOverlay('stats')}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-300"
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
              onClick={() => setOverlay(overlay === 'menu' ? null : 'menu')}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-300"
            >
              ⚙
            </button>
            {overlay === 'menu' && (
              <>
                {/* 지도(leaflet z-index ~1000)보다 위 — 바깥 탭으로 닫기 */}
                <div className="fixed inset-0 z-[1040]" onClick={() => setOverlay(null)} />
                <div className="absolute right-0 z-[1050] mt-1 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setOverlay('importGuide')}
                    disabled={importing !== null}
                    className="block w-full px-4 py-2 text-left text-sm text-slate-700 disabled:text-slate-300 dark:text-slate-200 dark:disabled:text-slate-600"
                  >
                    {importing ? '가져오는 중…' : '가져오기'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverlay('backup')}
                    className="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200"
                  >
                    내보내기
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverlay('theme')}
                    className="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200"
                  >
                    테마
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverlay('about')}
                    className="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200"
                  >
                    앱 정보
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {error && (
        <p className="rounded-lg bg-red-100 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {/* 권한 미흡 안내 — 수집 안 켜진 상태에서 '앱 사용 중만'/'거부'면 승격을 유도 */}
      {!isCollecting &&
        (permStatus === AuthorizationStatus.WhenInUse ||
          permStatus === AuthorizationStatus.Denied ||
          permStatus === AuthorizationStatus.Restricted) && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
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
            <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
              창이 안 뜨면 설정 &gt; 앱 &gt; 위치트래커 &gt; 권한 &gt; 위치에서 ‘항상 허용’으로 바꿔주세요.
            </p>
          </div>
        )}

      {importing && (
        <p className="rounded-lg bg-blue-100 p-3 text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          가져오는 중…{' '}
          {importing.total > 0 && `${Math.round((importing.done / importing.total) * 100)}%`}
        </p>
      )}

      <div
        {...swipeDate}
        className="flex items-center justify-between rounded-lg bg-white p-2 shadow-sm dark:bg-slate-900"
      >
        <button
          type="button"
          onClick={() => changeDate(addDaysStr(date, -1))}
          className="px-4 py-1 text-lg text-slate-600 dark:text-slate-300"
        >
          ◀
        </button>
        <button
          type="button"
          onClick={() => setOverlay('calendar')}
          className="text-sm font-semibold text-slate-900 dark:text-slate-100"
        >
          {fmtDateWithDay(date)}
          {date === today && <span className="ml-1 text-blue-600 dark:text-blue-400">(오늘)</span>}
        </button>
        <button
          type="button"
          onClick={() => changeDate(addDaysStr(date, 1))}
          disabled={date >= today}
          className="px-4 py-1 text-lg text-slate-600 disabled:text-slate-300 dark:text-slate-300 dark:disabled:text-slate-600"
        >
          ▶
        </button>
      </div>

      <MapView
        trackPoints={points}
        stays={stayMarkers}
        focus={focus}
        mode={mapMode}
        fitKey={date}
        footprints={footprints}
        onModeChange={(m) => {
          setMapMode(m);
          if (m === 'all') selectStay(null);
        }}
        onStayTap={onStayTap}
        onFootprintTap={(label) => {
          setSearchLabel(label);
          setOverlay('search');
        }}
      />

      {/* grow로 남는 세로 공간까지 채워 카드 아래 빈 영역도 스와이프 대상이 되게 한다 */}
      <div {...swipeDate} className="grow overflow-hidden">
        {/* key={date}로 remount → 날짜가 바뀔 때마다 이동 방향의 slide-in이 한 번 재생된다 */}
        <StayList
          key={date}
          viewDate={date}
          stays={stays}
          liveStayId={liveStayId}
          ongoing={ongoing}
          ongoingLabel={ongoingLabel}
          selected={selected}
          ongoingSelected={ongoingSelected}
          slideDir={slideDir}
          cardRefs={cardRefs}
          onSelect={selectStay}
          onToggleOngoing={() => {
            setSelected(null);
            setOngoingSelected(!ongoingSelected);
            if (!ongoingSelected) setMapMode('day');
          }}
          onEdit={setLabelTarget}
          onDelete={onDelete}
          onEditOngoing={onLabelOngoing}
        />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={onImportFile}
      />

      {overlay === 'calendar' && (
        <CalendarSheet
          value={date}
          today={today}
          dataDays={dataDaySet}
          onPick={(d) => {
            changeDate(d);
            setOverlay(null);
          }}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === 'importGuide' && (
        <ImportGuideSheet
          onPickFile={() => {
            setOverlay(null);
            fileRef.current?.click();
          }}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === 'permRationale' && (
        <PermissionSheet
          onConfirm={() => {
            setOverlay(null);
            void start();
          }}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === 'collector' && (
        <CollectorSheet
          isCollecting={isCollecting}
          permStatus={permStatus}
          totalPoints={total}
          onStart={handleStartRequest}
          onStop={() => {
            void stop();
            setOverlay(null);
          }}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === 'backup' && <BackupSheet onClose={() => setOverlay(null)} />}
      {overlay === 'about' && <AboutSheet onClose={() => setOverlay(null)} />}
      {overlay === 'theme' && <ThemeSheet onClose={() => setOverlay(null)} />}
      {overlay === 'stats' && <StatsPanel onClose={() => setOverlay(null)} />}
      {overlay === 'search' && (
        <SearchPanel
          initialQuery={searchLabel ?? undefined}
          onClose={() => setOverlay(null)}
          onPickDate={(d) => {
            changeDate(d);
            setOverlay(null);
          }}
        />
      )}
      {labelTarget && <LabelSheet stay={labelTarget} onClose={() => setLabelTarget(null)} />}
    </div>
  );
}

export default App;
