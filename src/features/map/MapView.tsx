import { useEffect, useRef } from 'react';
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

export function MapView({ trackPoints, stays, focus, onStayTap }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  // 마커 클릭이 항상 최신 핸들러를 부르게 ref로 우회 — 핸들러가 바뀔 때마다 레이어를 다시 그리지 않기 위해
  const onStayTapRef = useRef(onStayTap);
  onStayTapRef.current = onStayTap;

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
    if (all.length > 0) {
      map.fitBounds(L.latLngBounds(all.map((p) => [p.lat, p.lng] as L.LatLngTuple)), {
        padding: [24, 24],
        maxZoom: 17,
      });
    }
  }, [trackPoints, stays]);

  useEffect(() => {
    if (focus) mapRef.current?.setView([focus.lat, focus.lng], FOCUS_ZOOM);
  }, [focus]);

  return <div ref={containerRef} className="h-64 w-full rounded-xl" />;
}
