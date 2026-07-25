import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import BackgroundGeolocation from '@transistorsoft/capacitor-background-geolocation';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { footprintRadius } from './computeFootprints';
import type { Footprint } from './computeFootprints';

interface LatLng {
  lat: number;
  lng: number;
}

// id가 null이면 아직 저장 전인 '지금 여기' 마커 — 탭 대상이 아니다
export interface StayMarker extends LatLng {
  id: number | null;
}

export type MapMode = 'day' | 'all';

interface MapViewProps {
  trackPoints: LatLng[]; // 하루치 이동 궤적 (polyline)
  stays: StayMarker[]; // 체류 지점 (marker)
  focus: LatLng | null; // 선택된 stay — 바뀌면 지도를 그 위치로 이동
  mode: MapMode; // day = 하루 궤적, all = 전체 기간 발자국
  fitKey: string; // 화면 문맥(날짜) — 이것 또는 mode가 바뀔 때만 전체 범위로 카메라 이동
  footprints: Footprint[];
  onModeChange: (mode: MapMode) => void;
  onStayTap: (id: number) => void;
  onFootprintTap: (label: string) => void;
}

const SEOUL: L.LatLngTuple = [37.5665, 126.978];
const FOCUS_ZOOM = 16;
const FIT_OPTS = { padding: [24, 24] as L.PointTuple, maxZoom: 17 };
// 기본 flyTo는 거리 비례로 수 초씩 걸려 카드 탭 반응이 굼뜨다 — 고정 단축
const FLY_OPTS = { duration: 1.0 };

// circleMarker(SVG)는 줌 애니메이션 중 레이어째 CSS scale돼 화면을 덮을 만큼 커진다 — 픽셀 고정 divIcon 사용
const STAY_ICON = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#ef4444;border:2.5px solid #b91c1c;opacity:0.9"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// 이름표는 누적 상위만 — 전부 붙이면 밀집 지역에서 겹쳐 못 읽는다
const FOOTPRINT_NAME_TOP = 8;

// divIcon에 html 문자열 대신 요소를 만들어 넘긴다 — 라벨이 사용자 입력이라 innerHTML 주입 방지
function footprintEl(f: Footprint, radius: number, showName: boolean): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `width:${radius * 2}px;height:${radius * 2}px;border-radius:50%;background:rgba(37,99,235,0.35);border:2px solid #2563eb;position:relative`;
  if (showName) {
    const name = document.createElement('span');
    name.textContent = f.label;
    name.style.cssText =
      'position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:2px;white-space:nowrap;font-size:10px;font-weight:700;color:#1e3a8a;background:rgba(255,255,255,0.85);padding:0 4px;border-radius:4px';
    el.appendChild(name);
  }
  return el;
}

export function MapView({
  trackPoints,
  stays,
  focus,
  mode,
  fitKey,
  footprints,
  onModeChange,
  onStayTap,
  onFootprintTap,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  // 마커 클릭이 항상 최신 핸들러를 부르게 ref로 우회 — 핸들러가 바뀔 때마다 레이어를 다시 그리지 않기 위해
  const onStayTapRef = useRef(onStayTap);
  onStayTapRef.current = onStayTap;
  const onFootprintTapRef = useRef(onFootprintTap);
  onFootprintTapRef.current = onFootprintTap;
  // 포커스 해제 시 하루 전체 범위로 돌아가기 위해 마지막 bounds를 기억한다
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  const hadFocusRef = useRef(false);
  // 주기 재조회(30초 refetch·수집 invalidate)로 데이터만 바뀐 갱신엔 카메라를 안 움직인다 —
  // fitBounds는 문맥(날짜·모드)당 최초 데이터 도착 때 한 번만. 실제 fit 성공 시에만 key를 소비해
  // 빈 날짜에 나중에 데이터가 생기는 경우도 커버한다
  const lastFitRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { attributionControl: false }).setView(SEOUL, 12);
    L.control.attribution({ prefix: false }).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    const fitContext = `${mode}:${fitKey}`;
    const fitOnce = () => {
      if (boundsRef.current && lastFitRef.current !== fitContext) {
        map.fitBounds(boundsRef.current, FIT_OPTS);
        lastFitRef.current = fitContext;
      }
    };

    layer.clearLayers();

    if (mode === 'all') {
      // 발자국 모드: 라벨별 원(넓이 ∝ 누적 체류시간). 궤적·체류 마커는 그리지 않는다
      const maxMs = footprints[0]?.totalMs ?? 0;
      footprints.forEach((f, i) => {
        const r = footprintRadius(f.totalMs, maxMs);
        const icon = L.divIcon({
          className: '',
          html: footprintEl(f, r, i < FOOTPRINT_NAME_TOP),
          iconSize: [r * 2, r * 2],
          iconAnchor: [r, r],
        });
        L.marker([f.lat, f.lng], { icon })
          .addTo(layer)
          .on('click', () => onFootprintTapRef.current(f.label));
      });
      boundsRef.current =
        footprints.length > 0
          ? L.latLngBounds(footprints.map((f) => [f.lat, f.lng] as L.LatLngTuple))
          : null;
      fitOnce();
      return;
    }

    if (trackPoints.length > 1) {
      L.polyline(
        trackPoints.map((p) => [p.lat, p.lng] as L.LatLngTuple),
        { color: '#3b82f6', weight: 3 },
      ).addTo(layer);
    }
    // 기본 마커 아이콘은 번들러에서 이미지 경로가 깨지므로 divIcon을 쓴다
    for (const s of stays) {
      const marker = L.marker([s.lat, s.lng], { icon: STAY_ICON }).addTo(layer);
      if (s.id !== null) {
        const id = s.id;
        marker.on('click', () => onStayTapRef.current(id));
      }
    }

    const all = [...trackPoints, ...stays];
    boundsRef.current = all.length > 0 ? L.latLngBounds(all.map((p) => [p.lat, p.lng] as L.LatLngTuple)) : null;
    fitOnce();
  }, [mode, fitKey, footprints, trackPoints, stays]);

  // flyTo 비행 중엔 렌더러 컨테이너가 매 프레임 CSS scale돼 궤적 선이 화면을 덮는다
  // (CSS 줌 전환과 별개 경로라 zoom-anim 클래스가 안 붙음) — 비행 동안만 벡터 팬을 숨긴다
  const flyWithTrackHidden = (fly: (map: L.Map) => void) => {
    const map = mapRef.current;
    if (!map) return;
    const pane = map.getPane('overlayPane');
    if (pane) {
      pane.style.visibility = 'hidden';
      const show = () => {
        pane.style.visibility = '';
      };
      map.once('moveend', show);
      window.setTimeout(show, 1500); // 뷰 변화가 없어 moveend가 안 오는 경우 안전장치
    }
    fly(map);
  };

  const [locating, setLocating] = useState(false);
  const onMyLocation = async () => {
    setLocating(true);
    try {
      if (Capacitor.isNativePlatform()) {
        // persist: false — 버튼 조회로 points 데이터를 오염시키지 않는다
        const loc = await BackgroundGeolocation.getCurrentPosition({ samples: 1, timeout: 30, persist: false });
        flyWithTrackHidden((m) => m.flyTo([loc.coords.latitude, loc.coords.longitude], FOCUS_ZOOM, FLY_OPTS));
      } else {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10_000 }),
        );
        flyWithTrackHidden((m) => m.flyTo([pos.coords.latitude, pos.coords.longitude], FOCUS_ZOOM, FLY_OPTS));
      }
    } catch {
      // 위치 조회 실패(권한 거부·타임아웃)는 조용히 무시
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (focus) {
      hadFocusRef.current = true;
      flyWithTrackHidden((m) => m.flyTo([focus.lat, focus.lng], FOCUS_ZOOM, FLY_OPTS));
    } else if (hadFocusRef.current) {
      // 선택 해제 → 하루 전체 범위로 복귀 (최초 마운트 땐 발동하지 않는다)
      hadFocusRef.current = false;
      if (boundsRef.current) flyWithTrackHidden((m) => m.flyToBounds(boundsRef.current!, { ...FIT_OPTS, ...FLY_OPTS }));
    }
  }, [focus]);

  return (
    // 페인트 격리 — Android WebView가 leaflet 변환 레이어 탓에 스크롤 밖 영역을 백화시키는 문제 방지
    <div className="relative [contain:paint] [transform:translateZ(0)]">
      <div ref={containerRef} className="h-64 w-full rounded-xl" />
      {/* left-12: leaflet 기본 줌 컨트롤(좌상단, 폭 ~44px)을 가리지 않는 위치 */}
      <div className="absolute left-12 top-2 z-[1000] flex gap-0.5 rounded-full bg-white p-1 shadow-md">
        {(['day', 'all'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              mode === m ? 'bg-blue-600 text-white' : 'text-slate-500'
            }`}
          >
            {m === 'day' ? '하루' : '전체'}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onMyLocation}
        disabled={locating}
        aria-label="내 위치"
        className={`absolute right-2 top-2 z-[1000] rounded-full bg-white p-2.5 text-slate-700 shadow-md disabled:text-slate-300 ${
          locating ? 'animate-pulse' : ''
        }`}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
        </svg>
      </button>
    </div>
  );
}
