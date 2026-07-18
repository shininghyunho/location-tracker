import type { NewPoint } from '../../db/points';
import type { NewStay } from '../../db/stays';

// 실측 스키마(PRD §6-1) 중 읽는 필드만 선언 — 나머지 키는 무시된다
interface TimelineFile {
  semanticSegments?: {
    startTime?: string;
    endTime?: string;
    visit?: { topCandidate?: { placeLocation?: { latLng?: string } } };
    timelinePath?: { point?: string; time?: string }[];
  }[];
  rawSignals?: {
    position?: { LatLng?: string; accuracyMeters?: number; timestamp?: string };
  }[];
}

export interface ParsedTimeline {
  stays: NewStay[];
  points: NewPoint[];
}

// "37.4058816°, 126.6787599°" → [lat, lng]. 형식·범위가 벗어나면 null
export function parseLatLng(raw: string): [number, number] | null {
  const parts = raw.split(',').map((p) => p.replace('°', '').trim());
  // 빈 파트("37.40,")는 Number('')=0으로 통과해 (37.4, 0) 같은 바다 좌표가 유입되므로 먼저 막는다
  if (parts.length !== 2 || parts.some((p) => p === '')) return null;
  const [lat, lng] = parts.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
}

// import 파일의 시각은 오프셋 표기가 제각각(Z·+00:00 등)일 수 있는데, 앱 전체가 +09:00
// 사전순 비교를 전제하므로(설계 §3 단일 타임존) 저장 전에 KST로 통일한다.
// getUTC*로 조립해 실행 환경 타임존과 무관하게 결과가 고정된다.
export function toKstIso(raw: string): string | null {
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return null;
  const k = new Date(ms + 9 * 3_600_000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())}` +
    `T${p(k.getUTCHours())}:${p(k.getUTCMinutes())}:${p(k.getUTCSeconds())}.${p(k.getUTCMilliseconds(), 3)}+09:00`
  );
}

// PRD §6-2 매핑: visit→stay, timelinePath·rawSignals.position→point. 깨진 항목은 건너뛴다
export function parseTimeline(raw: unknown): ParsedTimeline {
  const file = raw as TimelineFile;
  const stays: NewStay[] = [];
  const points: NewPoint[] = [];

  for (const seg of file.semanticSegments ?? []) {
    if (seg.visit) {
      const latLng = seg.visit.topCandidate?.placeLocation?.latLng;
      const coords = latLng ? parseLatLng(latLng) : null;
      const start = seg.startTime ? toKstIso(seg.startTime) : null;
      const end = seg.endTime ? toKstIso(seg.endTime) : null;
      if (coords && start && end) {
        stays.push({
          start_ts: start,
          end_ts: end,
          lat: coords[0],
          lng: coords[1],
          label: null,
          source: 'import',
        });
      }
    }
    for (const p of seg.timelinePath ?? []) {
      const coords = p.point ? parseLatLng(p.point) : null;
      const ts = p.time ? toKstIso(p.time) : null;
      if (coords && ts) {
        points.push({ ts, lat: coords[0], lng: coords[1], accuracy_m: null, source: 'import' });
      }
    }
  }

  for (const sig of file.rawSignals ?? []) {
    const pos = sig.position;
    const coords = pos?.LatLng ? parseLatLng(pos.LatLng) : null;
    const ts = pos?.timestamp ? toKstIso(pos.timestamp) : null;
    if (coords && ts) {
      points.push({
        ts,
        lat: coords[0],
        lng: coords[1],
        accuracy_m: pos?.accuracyMeters ?? null,
        source: 'import',
      });
    }
  }

  return { stays, points };
}
