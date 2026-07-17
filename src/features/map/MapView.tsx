import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface LatLng {
  lat: number;
  lng: number;
}

interface MapViewProps {
  trackPoints: LatLng[]; // 하루치 이동 궤적 (polyline)
  stays: LatLng[]; // 체류 지점 (marker)
}

const SEOUL: L.LatLngTuple = [37.5665, 126.978];

export function MapView({ trackPoints, stays }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

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
      L.circleMarker([s.lat, s.lng], {
        radius: 9,
        color: '#b91c1c',
        fillColor: '#ef4444',
        fillOpacity: 0.8,
      }).addTo(layer);
    }

    const all = [...trackPoints, ...stays];
    if (all.length > 0) {
      map.fitBounds(L.latLngBounds(all.map((p) => [p.lat, p.lng] as L.LatLngTuple)), {
        padding: [24, 24],
        maxZoom: 17,
      });
    }
  }, [trackPoints, stays]);

  return <div ref={containerRef} className="h-64 w-full rounded-xl" />;
}
