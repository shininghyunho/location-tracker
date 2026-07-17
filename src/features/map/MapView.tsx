import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import BackgroundGeolocation from '@transistorsoft/capacitor-background-geolocation';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface LatLng {
  lat: number;
  lng: number;
}

// id가 null이면 아직 저장 전인 '지금 여기' 마커 — 탭 대상이 아니다
export interface StayMarker extends LatLng {
  id: number | null;
}

interface MapViewProps {
  trackPoints: LatLng[]; // 하루치 이동 궤적 (polyline)
  stays: StayMarker[]; // 체류 지점 (marker)
  focus: LatLng | null; // 선택된 stay — 바뀌면 지도를 그 위치로 이동
  onStayTap: (id: number) => void;
}

const SEOUL: L.LatLngTuple = [37.5665, 126.978];
const FOCUS_ZOOM = 16;
const FIT_OPTS = { padding: [24, 24] as L.PointTuple, maxZoom: 17 };

export function MapView({ trackPoints, stays, focus, onStayTap }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  // 마커 클릭이 항상 최신 핸들러를 부르게 ref로 우회 — 핸들러가 바뀔 때마다 레이어를 다시 그리지 않기 위해
  const onStayTapRef = useRef(onStayTap);
  onStayTapRef.current = onStayTap;
  // 포커스 해제 시 하루 전체 범위로 돌아가기 위해 마지막 bounds를 기억한다
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  const hadFocusRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current).setView(SEOUL, 12);
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

    layer.clearLayers();
    if (trackPoints.length > 1) {
      L.polyline(
        trackPoints.map((p) => [p.lat, p.lng] as L.LatLngTuple),
        { color: '#3b82f6', weight: 3 },
      ).addTo(layer);
    }
    // 기본 마커 아이콘은 번들러에서 이미지 경로가 깨지므로 circleMarker를 쓴다
    for (const s of stays) {
      const marker = L.circleMarker([s.lat, s.lng], {
        radius: 9,
        color: '#b91c1c',
        fillColor: '#ef4444',
        fillOpacity: 0.8,
      }).addTo(layer);
      if (s.id !== null) {
        const id = s.id;
        marker.on('click', () => onStayTapRef.current(id));
      }
    }

    const all = [...trackPoints, ...stays];
    boundsRef.current = all.length > 0 ? L.latLngBounds(all.map((p) => [p.lat, p.lng] as L.LatLngTuple)) : null;
    if (boundsRef.current) map.fitBounds(boundsRef.current, FIT_OPTS);
  }, [trackPoints, stays]);

  const [locating, setLocating] = useState(false);
  const onMyLocation = async () => {
    setLocating(true);
    try {
      if (Capacitor.isNativePlatform()) {
        // persist: false — 버튼 조회로 points 데이터를 오염시키지 않는다
        const loc = await BackgroundGeolocation.getCurrentPosition({ samples: 1, timeout: 30, persist: false });
        mapRef.current?.flyTo([loc.coords.latitude, loc.coords.longitude], FOCUS_ZOOM);
      } else {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10_000 }),
        );
        mapRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], FOCUS_ZOOM);
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
      map.flyTo([focus.lat, focus.lng], FOCUS_ZOOM);
    } else if (hadFocusRef.current) {
      // 선택 해제 → 하루 전체 범위로 복귀 (최초 마운트 땐 발동하지 않는다)
      hadFocusRef.current = false;
      if (boundsRef.current) map.flyToBounds(boundsRef.current, FIT_OPTS);
    }
  }, [focus]);

  return (
    <div className="relative">
      <div ref={containerRef} className="h-64 w-full rounded-xl" />
      <button
        type="button"
        onClick={onMyLocation}
        disabled={locating}
        aria-label="내 위치"
        className={`absolute bottom-2 right-2 z-[1000] rounded-full bg-white p-2.5 text-slate-700 shadow-md disabled:text-slate-300 ${
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
